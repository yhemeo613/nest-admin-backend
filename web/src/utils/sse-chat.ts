/**
 * AI 流式对话 SSE 消费工具（POST + fetch + ReadableStream）。
 *
 * 不走 @/utils/http 的 axios 封装（其响应拦截器面向 JSON），
 * 由这里直接消费 text/event-stream。
 * 帧格式：data: {"delta":"...","done":false}；
 * 结束帧 done:true 附带 usage / model；错误帧带 code/message。
 */

export interface StreamChatUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface StreamChatOptions {
  /** 用户消息 */
  message: string
  /** 模型配置 ID（AiModel.id，缺省用后端默认模型） */
  modelId?: string
  /** Bearer 令牌 */
  token: string
  /** 中断信号（停止生成） */
  signal?: AbortSignal
  /** 最近对话历史（最多 20 条，多轮意图理解） */
  history?: { role: 'user' | 'assistant'; content: string }[]
  /** 工具执行活动回调 */
  onTool?: (t: { name: string; status: 'running' | 'done' | 'error' }) => void
  /** 收到增量文本 */
  onDelta: (delta: string) => void
  /** 流结束（usage / 实际命中的模型，可能缺省） */
  onDone?: (info: { usage?: StreamChatUsage | null; model?: string }) => void
}

export async function streamChat(options: StreamChatOptions): Promise<void> {
  const res = await fetch('/api/v1/ai/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.token}`
    },
    body: JSON.stringify({
      message: options.message,
      ...(options.modelId ? { modelId: options.modelId } : {}),
      ...(options.history?.length ? { history: options.history } : {})
    }),
    signal: options.signal
  })

  if (!res.ok || !res.body) {
    // HTTP 错误（401/403/5xx）返回 JSON 错误结构
    let message = `请求失败（HTTP ${res.status}）`
    try {
      const err = await res.json()
      if (err?.message) message = err.message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 帧以空行分隔，data: 开头
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let chunk: {
          delta?: string
          done?: boolean
          usage?: StreamChatUsage | null
          model?: string
          code?: number
          message?: string
          tool?: { name: string; status: 'running' | 'done' | 'error' }
        }
        try {
          chunk = JSON.parse(payload)
        } catch {
          continue // 忽略无法解析的帧
        }
        if (chunk.code) throw new Error(chunk.message || 'AI 调用失败')
        if (chunk.tool) options.onTool?.(chunk.tool)
        if (chunk.delta) options.onDelta(chunk.delta)
        if (chunk.done) options.onDone?.({ usage: chunk.usage, model: chunk.model })
      }
    }
  }
}
