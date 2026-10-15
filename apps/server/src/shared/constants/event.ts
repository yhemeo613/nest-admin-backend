/** 跨层事件常量（EventEmitter2）：基础设施与业务模块之间只通信不 import */
export const AiEvent = {
  /** AI 调用失败：{ userId, model, errorMsg } → 通知等下游消费 */
  callFailed: 'ai.call.failed',
} as const;
