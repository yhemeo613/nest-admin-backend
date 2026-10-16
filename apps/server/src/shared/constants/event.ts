/** 跨层事件常量（EventEmitter2）：基础设施与业务模块之间只通信不 import */
export const AiEvent = {
  /** AI 调用失败：{ userId, model, errorMsg } → 通知等下游消费 */
  callFailed: 'ai.call.failed',
} as const;

/** 代码评审域事件：任务状态流转 → 通知/统计等下游消费 */
export const ReviewEvent = {
  /** 任务进入终态：{ taskId, status, gateStatus, createdBy } */
  taskFinished: 'review.task.finished',
  /** 任务失败：{ taskId, error, createdBy } */
  taskFailed: 'review.task.failed',
  /** 红线未通过：{ taskId, gateDetail, createdBy } */
  gateFailed: 'review.gate.failed',
} as const;

/** Redis 频道：任务实时事件（worker publish → SSE controller subscribe） */
export const REVIEW_TASK_CHANNEL_PREFIX = 'review:task:channel:';
