import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { AIMessage } from '@langchain/core/messages';
import { ChatGeneration, LLMResult } from '@langchain/core/outputs';

import { AiUsageService } from './ai-usage.service';

export interface AiUsageHandlerOptions {
  userId?: string;
  provider: string;
  model: string;
  /** 主模型失败且降级成功时，备用调用记为 fallback；主调用失败可静默不记（对齐旧门面语义） */
  status?: 'success' | 'fallback';
  /** 置 false 时不记录 error 行（降级场景主调用失败由备用调用的 fallback 行表达） */
  logErrors?: boolean;
}

/** 从 LLMResult 提取 token 用量（流式/非流式两种形态都兼容） */
export function extractUsage(response: LLMResult): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} | null {
  const llmOutput = response.llmOutput as
    | { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }
    | undefined;
  if (llmOutput?.usage) {
    const u = llmOutput.usage;
    return {
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
    };
  }
  // 流式聚合：AIMessageChunk.usage_metadata
  for (const gens of response.generations) {
    for (const gen of gens) {
      const meta = ((gen as ChatGeneration).message as AIMessage)?.usage_metadata;
      if (meta) {
        return {
          promptTokens: meta.input_tokens,
          completionTokens: meta.output_tokens,
          totalTokens: meta.total_tokens,
        };
      }
    }
  }
  return null;
}

/**
 * LangChain 回调：模型每次真实调用（含 Agent 每一轮、降级重试）自动落 ai_call_log 审计。
 * 一个实例携带一次调用的上下文（userId/provider/model），不复用。
 */
export class AiUsageHandler extends BaseCallbackHandler {
  name = 'ai-usage-handler';
  private startedAt = 0;

  constructor(
    private readonly usage: AiUsageService,
    private readonly opts: AiUsageHandlerOptions,
  ) {
    super();
  }

  handleLLMStart(): void {
    this.startedAt = Date.now();
  }

  handleLLMEnd(response: LLMResult): void {
    this.usage.log({
      userId: this.opts.userId,
      provider: this.opts.provider,
      model: this.opts.model,
      usage: extractUsage(response),
      latencyMs: Date.now() - this.startedAt,
      status: this.opts.status ?? 'success',
    });
  }

  handleLLMError(error: Error): void {
    if (this.opts.logErrors === false) return;
    this.usage.log({
      userId: this.opts.userId,
      provider: this.opts.provider,
      model: this.opts.model,
      usage: null,
      latencyMs: Date.now() - this.startedAt,
      status: 'error',
      errorMsg: error.message,
    });
  }
}
