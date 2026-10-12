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
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
      },
      { signal: params.signal },
    );
    const choice = completion.choices[0];
    return {
      content: choice?.message?.content ?? '',
      usage: completion.usage ? this.toUsage(completion.usage) : null,
      finishReason: choice?.finish_reason ?? null,
      model,
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
    const model = params.model ?? this.defaultModel;
    const stream = await this.client.chat.completions.create(
      {
        model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: params.signal },
    );
    let usageEmitted = false;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) yield { delta, done: false };
      if (chunk.usage) {
        usageEmitted = true;
        yield { delta: '', done: true, usage: this.toUsage(chunk.usage) };
      }
    }
    // 厂商未回传 usage 时兜底一个结束帧，避免覆盖已发出的真实用量
    if (!usageEmitted) yield { delta: '', done: true, usage: null };
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
