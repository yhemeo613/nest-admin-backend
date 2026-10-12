import { defineStore } from 'pinia'

import {
  fetchClearReadNotifications,
  fetchMarkAllNotificationsRead,
  fetchMarkNotificationRead,
  fetchNotifications
} from '@/api/notifications'

type NotifyType = Api.Notify.NotifyType

/**
 * 站内通知 store：数据源为真实后端接口（/api/v1/notifications）。
 * 首次使用自动加载；已读/清空先改本地再调接口，失败时回滚。
 */
export const useNoticeStore = defineStore('notice', () => {
  const list = ref<Api.Notify.NotificationItem[]>([])
  const counts = ref<Record<NotifyType, number>>({ NOTICE: 0, MESSAGE: 0, TODO: 0 })
  const totalUnread = ref(0)
  const loading = ref(false)
  let loaded = false

  /** 按类型分组（面板三个页签消费） */
  const notices = computed(() => list.value.filter((i) => i.type === 'NOTICE'))
  const messages = computed(() => list.value.filter((i) => i.type === 'MESSAGE'))
  const pendings = computed(() => list.value.filter((i) => i.type === 'TODO'))

  const applyResponse = (res: Api.Notify.ListResponse) => {
    list.value = res.list
    counts.value = res.counts
    totalUnread.value = res.totalUnread
  }

  /** 拉取通知（force=true 强制刷新，跳过「已加载」判断） */
  const load = async (force = false) => {
    if (loading.value || (loaded && !force)) return
    loading.value = true
    try {
      applyResponse(await fetchNotifications())
      loaded = true
    } finally {
      loading.value = false
    }
  }

  /** 单条已读 */
  const markRead = async (type: NotifyType, id: string) => {
    const item = list.value.find((i) => i.id === id)
    if (!item || item.read) return
    item.read = true
    counts.value[type] = Math.max(0, counts.value[type] - 1)
    totalUnread.value = Math.max(0, totalUnread.value - 1)
    try {
      await fetchMarkNotificationRead(id)
    } catch {
      item.read = false
      counts.value[type] += 1
      totalUnread.value += 1
    }
  }

  /** 全部已读（三个页签一起） */
  const markAllRead = async () => {
    if (!totalUnread.value) return
    const snapshot = {
      list: [...list.value],
      counts: { ...counts.value },
      total: totalUnread.value
    }
    list.value = list.value.map((i) => ({ ...i, read: true }))
    counts.value = { NOTICE: 0, MESSAGE: 0, TODO: 0 }
    totalUnread.value = 0
    try {
      await fetchMarkAllNotificationsRead()
    } catch {
      list.value = snapshot.list
      counts.value = snapshot.counts
      totalUnread.value = snapshot.total
    }
  }

  /** 清空当前页签已读条目 */
  const clearRead = async (kind: NotifyType) => {
    const removed = list.value.filter((i) => i.type === kind && i.read)
    if (!removed.length) return
    list.value = list.value.filter((i) => !(i.type === kind && i.read))
    try {
      await fetchClearReadNotifications(kind)
    } catch {
      list.value = [...list.value, ...removed].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      )
    }
  }

  // 布局首次触达 store 时自动加载一次
  void load()

  return {
    list,
    counts,
    totalUnread,
    loading,
    notices,
    messages,
    pendings,
    load,
    markRead,
    markAllRead,
    clearRead
  }
})
