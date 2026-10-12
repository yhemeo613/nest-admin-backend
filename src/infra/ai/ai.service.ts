import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { LLM_PROVIDER } from './ai.constants';
import { AiUsageService } from './ai-usage.service';
import {
  ChatDelta,
  ChatParams,
  ChatResult,
  ILlmProvider,
  TokenUsage,
  ToolCall,
} from './providers/llm-provider.interface';

/**
 * AI 统一门面：业务模块只注入 AiService。
 * 负责降级（主→备模型）、错误归一化、用量审计埋点。
 * 调用方可通过第三参传入数据库配置解析出的动态 Provider（AiProviderRegistry），
 * 缺省时使用 env 注入的默认 Provider（bootstrap/兼容模式）。
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly fallbackModel: string;
  private readonly defaultMaxTokens: number;

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: ILlmProvider,
    private readonly usage: AiUsageService,
    config: ConfigService,
  ) {
    this.fallbackModel = config.get<string>('ai.fallbackModel', '');
    this.defaultMaxTokens = config.get<number>('ai.maxTokens', 2048);
  }

  onModuleInit(): void {
    this.logger.log(
      `AI Provider(env 默认): ${this.provider.name}${this.fallbackModel ? `，备用模型: ${this.fallbackModel}` : ''}`,
    );
  }

  /** 同步对话：主模型失败时自动切备用模型重试一次 */
  async chat(
    userId: string,
    params: ChatParams,
    provider: ILlmProvider = this.provider,
  ): Promise<ChatResult> {
    const normalized = this.normalize(params, provider);
    const startedAt = Date.now();
    try {
      const result = await provider.chat(normalized);
      this.usage.log(
        this.logEntry(provider, userId, result.model, result.usage, startedAt, 'success'),
      );
      return result;
    } catch (error) {
      const fallback = await this.tryFallbackChat(provider, userId, normalized, startedAt, error);
      if (fallback) return fallback;
      throw this.wrapError(provider, userId, normalized, startedAt, error);
    }
  }

  /** 流式对话：首个分片产出前失败可降级；流式途中失败直接报错（调用方发错误帧） */
  async *chatStream(
    userId: string,
    params: ChatParams,
    provider: ILlmProvider = this.provider,
  ): AsyncIterable<ChatDelta> {
    const normalized = this.normalize(params, provider);
    const startedAt = Date.now();
    let produced = false;
    let usage: TokenUsage | null = null;
    let toolCalls: ToolCall[] | undefined;
    try {
      for await (const delta of provider.chatStream(normalized)) {
        if (delta.done) {
          usage = delta.usage ?? null;
          toolCalls = delta.toolCalls;
        } else {
          produced = true;
          yield delta;
        }
      }
      this.usage.log(
        this.logEntry(provider, userId, normalized.model ?? '', usage, startedAt, 'success'),
      );
      yield {
        delta: '',
        done: true,
        usage,
        model: normalized.model,
        ...(toolCalls?.length ? { toolCalls } : {}),
      };
    } catch (error) {
      if (!produced && this.canFallback(normalized.model)) {
        this.logger.warn(`主模型流式调用失败，降级到备用模型 ${this.fallbackModel}`);
        yield* this.fallbackStream(provider, userId, normalized, startedAt, error);
        return;
      }
      this.usage.log(
        this.logEntry(provider, userId, normalized.model ?? '', null, startedAt, 'error', error),
      );
      throw this.toBusinessError(error);
    }
  }

  /** 向量化（RAG 摄取/检索用），未显式指定时用 env 默认 Provider */
  embed(texts: string[], provider: ILlmProvider = this.provider): Promise<number[][]> {
    return provider.embed(texts);
  }

  get providerName(): string {
    return this.provider.name;
  }

  private normalize(params: ChatParams, provider: ILlmProvider): ChatParams {
    return {
      ...params,
      model: params.model ?? provider.defaultModel,
      maxTokens: params.maxTokens ?? this.defaultMaxTokens,
    };
  }

  private canFallback(model?: string): boolean {
    return Boolean(this.fallbackModel) && model !== this.fallbackModel;
  }

  private async tryFallbackChat(
    provider: ILlmProvider,
    userId: string,
    params: ChatParams,
    startedAt: number,
    cause: unknown,
  ): Promise<ChatResult | null> {
    if (!this.canFallback(params.model)) return null;
    this.logger.warn(`主模型调用失败，降级到备用模型 ${this.fallbackModel}`);
    try {
      const result = await provider.chat({ ...params, model: this.fallbackModel });
      this.usage.log({
        ...this.logEntry(provider, userId, result.model, result.usage, startedAt, 'fallback'),
        errorMsg: `主模型失败: ${this.errMsg(cause)}`,
      });
      return result;
    } catch (fallbackError) {
      this.usage.log(
        this.logEntry(
          provider,
          userId,
          this.fallbackModel,
          null,
          startedAt,
          'error',
          fallbackError,
        ),
      );
      throw this.toBusinessError(fallbackError);
    }
  }

  private async *fallbackStream(
    provider: ILlmProvider,
    userId: string,
    params: ChatParams,
    startedAt: number,
    cause: unknown,
  ): AsyncIterable<ChatDelta> {
    let usage: TokenUsage | null = null;
    try {
      for await (const delta of provider.chatStream({
        ...params,
        model: this.fallbackModel,
      })) {
        if (delta.done) {
          usage = delta.usage ?? null;
        } else {
          yield delta;
        }
      }
      this.usage.log({
        ...this.logEntry(provider, userId, this.fallbackModel, usage, startedAt, 'fallback'),
        errorMsg: `主模型失败: ${this.errMsg(cause)}`,
      });
      yield { delta: '', done: true, usage, model: this.fallbackModel };
    } catch (fallbackError) {
      this.usage.log(
        this.logEntry(
          provider,
          userId,
          this.fallbackModel,
          null,
          startedAt,
          'error',
          fallbackError,
        ),
      );
      throw this.toBusinessError(fallbackError);
    }
  }

  private logEntry(
    provider: ILlmProvider,
    userId: string,
    model: string,
    usage: TokenUsage | null,
    startedAt: number,
    status: 'success' | 'error' | 'fallback',
    error?: unknown,
  ) {
    return {
      userId,
      provider: provider.name,
      model,
      usage,
      latencyMs: Date.now() - startedAt,
      status,
      errorMsg: error ? this.errMsg(error) : undefined,
    };
  }

  private toBusinessError(error: unknown): BusinessException {
    return new BusinessException(ErrorCode.AI_CALL_FAILED, `${this.errMsg(error)}`);
  }

  private wrapError(
    provider: ILlmProvider,
    userId: string,
    params: ChatParams,
    startedAt: number,
    error: unknown,
  ) {
    this.usage.log(
      this.logEntry(provider, userId, params.model ?? '', null, startedAt, 'error', error),
    );
    return this.toBusinessError(error);
  }

  private errMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
