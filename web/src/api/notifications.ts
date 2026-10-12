import request from '@/utils/http'

// ==================== 站内通知（真实接口） ====================

/** 我的通知列表 + 各类型未读数（登录即可，按用户隔离） */
export function fetchNotifications() {
  return request.get<Api.Notify.ListResponse>({ url: '/api/v1/notifications' })
}

/** 单条标为已读 */
export function fetchMarkNotificationRead(id: string) {
  return request.request<null>({
    url: `/api/v1/notifications/${id}/read`,
    method: 'PATCH'
  })
}

/** 全部标为已读（可限定类型） */
export function fetchMarkAllNotificationsRead(type?: Api.Notify.NotifyType) {
  return request.post<{ affected: number }>({
    url: '/api/v1/notifications/read-all',
    params: type ? { type } : undefined
  })
}

/** 清空已读（软删除，可限定类型） */
export function fetchClearReadNotifications(type?: Api.Notify.NotifyType) {
  return request.del<{ affected: number }>({
    url: '/api/v1/notifications/read',
    params: type ? { type } : undefined
  })
}
