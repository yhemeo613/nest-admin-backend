/** LLM Provider 统一接口：业务代码只面向此接口编程，与具体厂商解耦 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatParams {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** 请求中断级联取消（前端断开连接时停止 LLM 调用，避免浪费 Token） */
  signal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  content: string;
  usage: TokenUsage | null;
  finishReason: string | null;
  /** 实际命中的模型（降级场景与入参不同） */
  model: string;
}

export interface ChatDelta {
  delta: string;
  done: boolean;
  usage?: TokenUsage | null;
}

export interface ILlmProvider {
  readonly name: string;
  /** 厂商默认模型（入参未指定 model 时使用，也用于审计落库） */
  readonly defaultModel: string;
  /** 同步补全 */
  chat(params: ChatParams): Promise<ChatResult>;
  /** 流式补全 */
  chatStream(params: ChatParams): AsyncIterable<ChatDelta>;
  /** 向量化 */
  embed(texts: string[]): Promise<number[][]>;
}
