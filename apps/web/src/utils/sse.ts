/**
 * 轻量 fetch-SSE 客户端（替代原生 EventSource：支持 Authorization header）。
 * 后端 @Sse() 端点返回 text/event-stream，逐帧 `data: {...}\n\n`。
 */
import { useUserStore } from '@/store/modules/user'

export interface SseHandlers<T = Record<string, unknown>> {
  onMessage: (data: T) => void
  onError?: (err: Error) => void
  onOpen?: () => void
}

export interface SseConnection {
  close: () => void
}

/** 从 user store 取 token（与 @/utils/http 同一来源） */
function getToken(): string {
  return useUserStore().accessToken || ''
}

export function connectSse<T = Record<string, unknown>>(
  url: string,
  handlers: SseHandlers<T>
): SseConnection {
  const controller = new AbortController()
  let closed = false

  void (async () => {
    try {
      const res = await fetch(url, {
        headers: {
          accept: 'text/event-stream',
          authorization: `Bearer ${getToken()}`
        },
        signal: controller.signal
      })
      if (!res.ok || !res.body) {
        throw new Error(`SSE HTTP ${res.status}`)
      }
      handlers.onOpen?.()

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx: number
        // SSE 帧以空行分隔
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const dataLines = frame
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
          if (!dataLines.length) continue
          try {
            const data = JSON.parse(dataLines.join('\n')) as T
            handlers.onMessage(data)
          } catch {
            // 忽略坏帧
          }
        }
      }
      if (!closed) handlers.onError?.(new Error('SSE 连接结束'))
    } catch (e) {
      if (!closed && (e as Error).name !== 'AbortError') {
        handlers.onError?.(e as Error)
      }
    }
  })()

  return {
    close: () => {
      closed = true
      controller.abort()
    }
  }
}
