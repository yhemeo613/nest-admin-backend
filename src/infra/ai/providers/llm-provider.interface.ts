/** LLM Provider 统一接口：业务代码只面向此接口编程，与具体厂商解耦 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** assistant 携带 tool_calls 时可为 null（OpenAI 协议要求） */
  content: string | null;
  /** assistant 请求调用工具（回传给模型时用 OpenAI 嵌套形态） */
  tool_calls?: RequestToolCall[];
  /** tool 结果消息对应 tool_call id */
  tool_call_id?: string;
}

/** 请求侧 tool_calls（OpenAI 嵌套形态） */
export interface RequestToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** 模型发起的工具调用（arguments 为 JSON 字符串） */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** 工具定义（OpenAI function calling 形态） */
export interface ChatToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatParams {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** 工具定义（传入即启用 function calling 循环） */
  tools?: ChatToolDef[];
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
  /** 模型请求调用的工具（finishReason=tool_calls 时非空） */
  toolCalls?: ToolCall[];
}

export interface ChatDelta {
  delta: string;
  done: boolean;
  usage?: TokenUsage | null;
  /** 结束帧附带：实际命中的模型（降级场景与入参可能不同） */
  model?: string;
  /** 结束帧附带：模型请求调用的工具（流式 tool_calls 聚合结果） */
  toolCalls?: ToolCall[];
  /** 工具执行活动帧：running 开始 / done 完成 / error 失败 */
  tool?: { name: string; status: 'running' | 'done' | 'error' };
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
