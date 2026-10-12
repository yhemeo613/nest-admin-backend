import { ChatDelta, ChatParams, ChatResult, ILlmProvider } from './llm-provider.interface';

export interface OllamaOptions {
  baseURL: string;
  model: string;
  embeddingModel?: string;
  timeoutMs: number;
}

interface OllamaChatChunk {
  message?: { content?: string };
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

/** Ollama 本地私有化模型 Provider（内网/离线场景），基于原生 fetch 调用其 HTTP API */
export class OllamaProvider implements ILlmProvider {
  readonly name = 'ollama';
  readonly defaultModel: string;
  private readonly baseURL: string;
  private readonly embeddingModel: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaOptions) {
    this.baseURL = options.baseURL.replace(/\/$/, '');
    this.defaultModel = options.model;
    this.embeddingModel = options.embeddingModel || 'nomic-embed-text';
    this.timeoutMs = options.timeoutMs;
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model ?? this.defaultModel,
        messages: params.messages,
        stream: false,
        options: { temperature: params.temperature, num_predict: params.maxTokens },
      }),
      signal: params.signal ?? AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`ollama chat 失败: HTTP ${res.status}`);
    const json = (await res.json()) as OllamaChatChunk;
    return {
      content: json.message?.content ?? '',
      usage: this.toUsage(json),
      finishReason: json.done_reason ?? null,
      model: params.model ?? this.defaultModel,
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model ?? this.defaultModel,
        messages: params.messages,
        stream: true,
        options: { temperature: params.temperature, num_predict: params.maxTokens },
      }),
      signal: params.signal ?? AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok || !res.body) throw new Error(`ollama stream 失败: HTTP ${res.status}`);

    // NDJSON 流解析：逐行读取 JSON 帧
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (!line) continue;
        const chunk = JSON.parse(line) as OllamaChatChunk;
        if (chunk.done) {
          yield { delta: '', done: true, usage: this.toUsage(chunk) };
          return;
        }
        const delta = chunk.message?.content ?? '';
        if (delta) yield { delta, done: false };
      }
    }
    yield { delta: '', done: true, usage: null };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseURL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, input: texts }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`ollama embed 失败: HTTP ${res.status}`);
    const json = (await res.json()) as { embeddings: number[][] };
    return json.embeddings;
  }

  private toUsage(chunk: OllamaChatChunk) {
    const promptTokens = chunk.prompt_eval_count ?? 0;
    const completionTokens = chunk.eval_count ?? 0;
    if (promptTokens === 0 && completionTokens === 0) return null;
    return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  }
}
