import { Logger } from '@nestjs/common';
import OpenAI from 'openai';

import {
  ChatDelta,
  ChatParams,
  ChatResult,
  ILlmProvider,
  TokenUsage,
} from './llm-provider.interface';

export interface OpenAiCompatibleOptions {
  name: string;
  apiKey: string;
  baseURL: string;
  model: string;
  embeddingModel?: string;
  timeoutMs: number;
}

/**
 * OpenAI 兼容协议 Provider：
 * 覆盖 OpenAI 官方及 DeepSeek / 通义千问 / 智谱 / Moonshot / Kimi 等所有兼容厂商。
 */
export class OpenAiCompatibleProvider implements ILlmProvider {
  readonly name: string;
  readonly defaultModel: string;
  private readonly client: OpenAI;
  private readonly embeddingModel: string;

  constructor(options: OpenAiCompatibleOptions) {
    this.name = options.name;
    this.defaultModel = options.model;
    this.embeddingModel = options.embeddingModel || 'text-embedding-3-small';
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: options.timeoutMs,
      maxRetries: 0, // 重试统一由 AiService 门面控制（含降级逻辑）
    });
    if (!options.apiKey) {
      new Logger('AiProvider').warn(`${options.name} 未配置 AI_API_KEY，调用将失败`);
    }
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const model = params.model ?? this.defaultModel;
    const completion = await this.client.chat.completions.create(
      {
        model,
        messages: params.messages as unknown as OpenAI.ChatCompletionMessageParam[],
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        ...(params.tools?.length ? { tools: params.tools } : {}),
      },
      { signal: params.signal },
    );
    const choice = completion.choices[0];
    const toolCalls = choice?.message.tool_calls;
    return {
      content: choice?.message?.content ?? '',
      usage: completion.usage ? this.toUsage(completion.usage) : null,
      finishReason: choice?.finish_reason ?? null,
      model,
      toolCalls: toolCalls?.length
        ? toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          }))
        : undefined,
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
    const model = params.model ?? this.defaultModel;
    const stream = await this.client.chat.completions.create(
      {
        model,
        messages: params.messages as unknown as OpenAI.ChatCompletionMessageParam[],
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        ...(params.tools?.length ? { tools: params.tools } : {}),
      },
      { signal: params.signal },
    );
    let usage: TokenUsage | null = null;
    // 流式 tool_calls 分片聚合（id/名称/参数按 index 拼接）
    const toolCalls: { id: string; name: string; arguments: string }[] = [];
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const content = delta?.content ?? '';
      if (content) yield { delta: content, done: false };
      if (delta?.tool_calls) {
        for (const part of delta.tool_calls) {
          const index = part.index ?? 0;
          if (!toolCalls[index]) toolCalls[index] = { id: '', name: '', arguments: '' };
          if (part.id) toolCalls[index].id = part.id;
          if (part.function?.name) toolCalls[index].name += part.function.name;
          if (part.function?.arguments) toolCalls[index].arguments += part.function.arguments;
        }
      }
      if (chunk.usage) {
        usage = this.toUsage(chunk.usage);
      }
    }
    // 统一在流结束发一个结束帧（含 usage 与聚合后的 toolCalls）
    yield {
      delta: '',
      done: true,
      usage,
      ...(toolCalls.length ? { toolCalls } : {}),
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({ model: this.embeddingModel, input: texts });
    return res.data.map((d) => d.embedding);
  }

  private toUsage(usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }): TokenUsage {
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    };
  }
}
