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
} from './providers/llm-provider.interface';

/**
 * AI 统一门面：业务模块只注入 AiService。
 * 负责降级（主→备模型）、错误归一化、用量审计埋点。
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
      `AI Provider: ${this.provider.name}${this.fallbackModel ? `，备用模型: ${this.fallbackModel}` : ''}`,
    );
  }

  /** 同步对话：主模型失败时自动切备用模型重试一次 */
  async chat(userId: string, params: ChatParams): Promise<ChatResult> {
    const normalized = this.normalize(params);
    const startedAt = Date.now();
    try {
      const result = await this.provider.chat(normalized);
      this.usage.log(this.logEntry(userId, result.model, result.usage, startedAt, 'success'));
      return result;
    } catch (error) {
      const fallback = await this.tryFallbackChat(userId, normalized, startedAt, error);
      if (fallback) return fallback;
      throw this.wrapError(userId, normalized, startedAt, error);
    }
  }

  /** 流式对话：首个分片产出前失败可降级；流式途中失败直接报错（调用方发错误帧） */
  async *chatStream(userId: string, params: ChatParams): AsyncIterable<ChatDelta> {
    const normalized = this.normalize(params);
    const startedAt = Date.now();
    let produced = false;
    let usage: TokenUsage | null = null;
    try {
      for await (const delta of this.provider.chatStream(normalized)) {
        if (delta.done) {
          usage = delta.usage ?? null;
        } else {
          produced = true;
          yield delta;
        }
      }
      this.usage.log(this.logEntry(userId, normalized.model ?? '', usage, startedAt, 'success'));
      yield { delta: '', done: true, usage };
    } catch (error) {
      if (!produced && this.canFallback(normalized.model)) {
        this.logger.warn(`主模型流式调用失败，降级到备用模型 ${this.fallbackModel}`);
        yield* this.fallbackStream(userId, normalized, startedAt, error);
        return;
      }
      this.usage.log(
        this.logEntry(userId, normalized.model ?? '', null, startedAt, 'error', error),
      );
      throw this.toBusinessError(error);
    }
  }

  /** 向量化（RAG 摄取/检索用） */
  embed(texts: string[]): Promise<number[][]> {
    return this.provider.embed(texts);
  }

  get providerName(): string {
    return this.provider.name;
  }

  private normalize(params: ChatParams): ChatParams {
    return {
      ...params,
      model: params.model ?? this.provider.defaultModel,
      maxTokens: params.maxTokens ?? this.defaultMaxTokens,
    };
  }

  private canFallback(model?: string): boolean {
    return Boolean(this.fallbackModel) && model !== this.fallbackModel;
  }

  private async tryFallbackChat(
    userId: string,
    params: ChatParams,
    startedAt: number,
    cause: unknown,
  ): Promise<ChatResult | null> {
    if (!this.canFallback(params.model)) return null;
    this.logger.warn(`主模型调用失败，降级到备用模型 ${this.fallbackModel}`);
    try {
      const result = await this.provider.chat({ ...params, model: this.fallbackModel });
      this.usage.log({
        ...this.logEntry(userId, result.model, result.usage, startedAt, 'fallback'),
        errorMsg: `主模型失败: ${this.errMsg(cause)}`,
      });
      return result;
    } catch (fallbackError) {
      this.usage.log(
        this.logEntry(userId, this.fallbackModel, null, startedAt, 'error', fallbackError),
      );
      throw this.toBusinessError(fallbackError);
    }
  }

  private async *fallbackStream(
    userId: string,
    params: ChatParams,
    startedAt: number,
    cause: unknown,
  ): AsyncIterable<ChatDelta> {
    let usage: TokenUsage | null = null;
    try {
      for await (const delta of this.provider.chatStream({
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
        ...this.logEntry(userId, this.fallbackModel, usage, startedAt, 'fallback'),
        errorMsg: `主模型失败: ${this.errMsg(cause)}`,
      });
      yield { delta: '', done: true, usage };
    } catch (fallbackError) {
      this.usage.log(
        this.logEntry(userId, this.fallbackModel, null, startedAt, 'error', fallbackError),
      );
      throw this.toBusinessError(fallbackError);
    }
  }

  private logEntry(
    userId: string,
    model: string,
    usage: TokenUsage | null,
    startedAt: number,
    status: 'success' | 'error' | 'fallback',
    error?: unknown,
  ) {
    return {
      userId,
      provider: this.provider.name,
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

  private wrapError(userId: string, params: ChatParams, startedAt: number, error: unknown) {
    this.usage.log(this.logEntry(userId, params.model ?? '', null, startedAt, 'error', error));
    return this.toBusinessError(error);
  }

  private errMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
