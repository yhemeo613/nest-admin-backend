import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElNotification } from 'element-plus'
import { reviewApi } from '@/api/review'
import { connectSse, SseConnection } from '@/utils/sse'
import { useUserStore } from './user'

/** 评审通知 store：SSE 实时接收 + 未读数管理 + toast 弹窗 */
export const useNoticeStore = defineStore('notice', () => {
  const unreadCount = ref(0)
  const latest = ref<Api.Review.NotifItem[]>([])
  let conn: SseConnection | null = null

  /** 初始化：拉未读 + 建 SSE（登录后由 Layout 调用） */
  async function init(): Promise<void> {
    const userStore = useUserStore()
    if (!userStore.accessToken) return
    await refreshUnread()
    if (conn) return // 防重复连接
    conn = connectSse<Api.Review.NotifItem & { type: string }>(
      '/api/v1/review/notifications/events',
      {
        onMessage: (n) => {
          unreadCount.value += 1
          latest.value.unshift(n)
          ElNotification({
            title: n.title,
            message: n.content ?? '',
            type:
              n.type === 'TASK_FAILED' ? 'error' : n.type === 'GATE_FAILED' ? 'warning' : 'success',
            duration: 5000,
            onClick: () => {
              if (n.taskId) {
                window.location.href = `/review/task/detail?id=${n.taskId}`
              }
            }
          })
        },
        onError: () => {
          // 断线后 10s 重连
          conn?.close()
          conn = null
          setTimeout(() => void init(), 10_000)
        }
      }
    )
  }

  async function refreshUnread(): Promise<void> {
    try {
      const res = await reviewApi.fetchNotifUnread()
      unreadCount.value = res.count
    } catch {
      // 静默
    }
  }

  async function markAllRead(): Promise<void> {
    await reviewApi.markAllNotifRead()
    unreadCount.value = 0
  }

  function destroy(): void {
    conn?.close()
    conn = null
  }

  return { unreadCount, latest, init, refreshUnread, markAllRead, destroy }
})
