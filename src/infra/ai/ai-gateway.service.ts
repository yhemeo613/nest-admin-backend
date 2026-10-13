import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGeneration, LLMResult } from '@langchain/core/outputs';
import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { AiRegistry, ResolvedModel } from './ai.registry';
import { AiUsageHandler, AiUsageHandlerOptions } from './ai-usage.handler';
import { AiUsageService } from './ai-usage.service';

/** 简单对话消息（业务侧入参，不直接依赖 LangChain 类型） */
export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatParams {
  messages: AiChatMessage[];
  /** 指定模型配置 ID（AiModel.id，优先于 model 名称） */
  modelId?: string;
  /** 指定模型名称 */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 流式分片帧（下游 SSE 直接消费） */
export interface AiStreamDelta {
  delta: string;
  done: boolean;
  usage?: AiTokenUsage | null;
  /** 结束帧附带：实际命中的模型（降级场景与入参不同） */
  model?: string;
}

/**
 * AI 门面（LangChain 版，替代旧手写 AiService/ILlmProvider 体系）：
 * - 模型实例由 AiRegistry 解析（DB 配置优先，env 兜底）
 * - 主→备模型降级：首个分片产出前失败自动切 AI_FALLBACK_MODEL 重试一次
 * - 每次真实调用经 AiUsageHandler 落 ai_call_log 审计
 * - 业务代码只注入本门面，禁止直接 import LangChain/厂商 SDK
 */
@Injectable()
export class AiGateway {
  private readonly logger = new Logger(AiGateway.name);

  constructor(
    private readonly registry: AiRegistry,
    private readonly usage: AiUsageService,
  ) {}

  /** 同步对话：聚合流式输出为完整文本 */
  async chat(
    userId: string,
    params: AiChatParams,
  ): Promise<{ content: string; usage: AiTokenUsage | null; model: string }> {
    let content = '';
    let usage: AiTokenUsage | null = null;
    let model = '';
    for await (const frame of this.chatStream(userId, params)) {
      if (frame.done) {
        usage = frame.usage ?? null;
        model = frame.model ?? '';
      } else if (frame.delta) {
        content += frame.delta;
      }
    }
    return { content, usage, model };
  }

  /**
   * 流式对话。帧协议：{delta, done:false} 分片；结束帧 {delta:'', done:true, usage, model}。
   * 失败抛 BusinessException(AI_CALL_FAILED)，调用方负责转错误帧。
   */
  async *chatStream(
    userId: string,
    params: AiChatParams,
    signal?: AbortSignal,
  ): AsyncIterable<AiStreamDelta> {
    const primary =
      (await this.registry.resolve(params.modelId, params.model)) ?? this.registry.envDefault();
    const fallback = this.registry.envFallback();

    let produced = false;
    try {
      for await (const frame of this.streamOnce(primary, userId, params, signal, {
        // 有备用模型时主调用失败不单独记 error 行，统一由备用调用记 fallback（对齐旧门面语义）
        logErrors: !fallback,
      })) {
        produced = true;
        yield frame;
      }
    } catch (error) {
      if (produced || !fallback || signal?.aborted) throw this.wrapError(error);
      this.logger.warn(
        `主模型 ${primary.modelName} 调用失败，降级到备用模型 ${fallback.modelName}`,
      );
      for await (const frame of this.streamOnce(fallback, userId, params, signal, {
        status: 'fallback',
      })) {
        yield frame;
      }
    }
  }

  /** 向量化（RAG 摄取/检索用） */
  embed(texts: string[]): Promise<number[][]> {
    return this.registry.embeddings().embedDocuments(texts);
  }

  private async *streamOnce(
    route: ResolvedModel,
    userId: string,
    params: AiChatParams,
    signal: AbortSignal | undefined,
    handlerOpts: Pick<AiUsageHandlerOptions, 'status' | 'logErrors'>,
  ): AsyncIterable<AiStreamDelta> {
    const handler = new AiUsageHandler(this.usage, {
      userId,
      provider: route.providerName,
      model: route.modelName,
      ...handlerOpts,
    });

    let usage: AiTokenUsage | null = null;
    try {
      const stream = await route.model.stream(this.toMessages(params.messages), {
        ...this.boundParams(params),
        signal,
      });
      for await (const chunk of stream) {
        if (signal?.aborted) return;
        const text = typeof chunk.content === 'string' ? chunk.content : '';
        if (text) yield { delta: text, done: false };
        const chunkUsage = this.chunkUsage(chunk);
        if (chunkUsage) usage = chunkUsage;
      }
    } catch (error) {
      handler.handleLLMError(error as Error);
      throw error;
    }

    handler.handleLLMEnd(this.toLlmResult(usage));
    yield { delta: '', done: true, usage, model: route.modelName };
  }

  /** 每次调用的模型参数（max_output 上限已固化在 registry 构造的模型实例里） */
  private boundParams(params: AiChatParams): Record<string, unknown> {
    const kwargs: Record<string, unknown> = {};
    if (params.temperature !== undefined) kwargs.temperature = params.temperature;
    if (params.maxTokens) kwargs.max_tokens = params.maxTokens;
    return kwargs;
  }

  private chunkUsage(chunk: AIMessage): AiTokenUsage | null {
    const meta = chunk.usage_metadata;
    if (!meta) return null;
    return {
      promptTokens: meta.input_tokens,
      completionTokens: meta.output_tokens,
      totalTokens: meta.total_tokens,
    };
  }

  /** 组装 LLMResult 供审计提取用量（stream 路径回调不保证触发 llm_end，统一在流结束落账） */
  private toLlmResult(usage: AiTokenUsage | null): LLMResult {
    return {
      generations: [[{ text: '', message: new AIMessage({ content: '' }) } as ChatGeneration]],
      llmOutput: usage
        ? {
            usage: {
              prompt_tokens: usage.promptTokens,
              completion_tokens: usage.completionTokens,
              total_tokens: usage.totalTokens,
            },
          }
        : undefined,
    };
  }

  private toMessages(messages: AiChatMessage[]): BaseMessage[] {
    return messages.map((m) => {
      if (m.role === 'system') return new SystemMessage(m.content);
      if (m.role === 'assistant') return new AIMessage(m.content);
      return new HumanMessage(m.content);
    });
  }

  private wrapError(error: unknown): BusinessException {
    const msg = error instanceof Error ? error.message : String(error);
    return new BusinessException(ErrorCode.AI_CALL_FAILED, msg);
  }
}
