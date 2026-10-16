import request from '@/utils/http'

/** 评审 API（统一 /api/v1 前缀；request 已自动解包 envelope.data） */
export const reviewApi = {
  // ---- 模型配置 ----
  fetchModels: (params?: { page?: number; pageSize?: number; keyword?: string }) =>
    request.get<Api.Common.PaginatedResponse<Api.Review.ModelItem>>({
      url: '/api/v1/review/models',
      params
    }),
  createModel: (data: Record<string, unknown>) =>
    request.post<Api.Review.ModelItem>({ url: '/api/v1/review/models', params: data }),
  updateModel: (id: string, data: Record<string, unknown>) =>
    request.put<Api.Review.ModelItem>({ url: `/api/v1/review/models/${id}`, params: data }),
  deleteModel: (id: string) => request.del<null>({ url: `/api/v1/review/models/${id}` }),
  testModel: (id: string) =>
    request.post<{ ok: boolean; latencyMs: number; message: string }>({
      url: `/api/v1/review/models/${id}/test`
    }),

  // ---- 仓库 ----
  fetchRepos: (params?: {
    page?: number
    pageSize?: number
    keyword?: string
    platform?: string
  }) =>
    request.get<Api.Common.PaginatedResponse<Api.Review.RepoItem>>({
      url: '/api/v1/review/repos',
      params
    }),
  createRepo: (data: Record<string, unknown>) =>
    request.post<Api.Review.RepoItem>({ url: '/api/v1/review/repos', params: data }),
  updateRepo: (id: string, data: Record<string, unknown>) =>
    request.put<Api.Review.RepoItem>({ url: `/api/v1/review/repos/${id}`, params: data }),
  deleteRepo: (id: string) => request.del<null>({ url: `/api/v1/review/repos/${id}` }),
  syncRepo: (id: string) =>
    request.post<Api.Review.RepoItem>({ url: `/api/v1/review/repos/${id}/sync` }),

  // ---- 任务 ----
  createTask: (data: {
    repoId: string
    modelId?: string
    mode: Api.Review.TaskMode
    fromRef?: string
    toRef?: string
    commitSha?: string
    mrUrl?: string
    requirementBackground?: string
  }) => request.post<Api.Review.TaskItem>({ url: '/api/v1/review/tasks', params: data }),
  fetchTasks: (params?: {
    page?: number
    pageSize?: number
    repoId?: string
    status?: string
    gateStatus?: string
  }) =>
    request.get<Api.Common.PaginatedResponse<Api.Review.TaskItem>>({
      url: '/api/v1/review/tasks',
      params
    }),
  fetchTask: (id: string) =>
    request.get<Api.Review.TaskItem>({ url: `/api/v1/review/tasks/${id}` }),
  cancelTask: (id: string) => request.post<null>({ url: `/api/v1/review/tasks/${id}/cancel` }),
  rerunTask: (id: string) =>
    request.post<Api.Review.TaskItem>({ url: `/api/v1/review/tasks/${id}/rerun` }),
  publishTask: (id: string) =>
    request.post<{ noteUrl: string | null; inlineCount: number; inlineFailed: number }>({
      url: `/api/v1/review/tasks/${id}/publish`
    }),
  fetchFindings: (
    id: string,
    params?: { severity?: string; category?: string; status?: string; isNew?: string }
  ) =>
    request.get<Api.Review.FindingItem[]>({ url: `/api/v1/review/tasks/${id}/findings`, params }),
  updateFinding: (id: string, status: Api.Review.FindingStatus) =>
    request.put<null>({ url: `/api/v1/review/findings/${id}`, params: { status } }),
  fetchTraceCalls: (id: string) =>
    request.get<Api.Review.TraceCallItem[]>({ url: `/api/v1/review/tasks/${id}/trace/calls` }),
  fetchTraceCall: (id: string, seq: number) =>
    request.get<Record<string, unknown>>({ url: `/api/v1/review/tasks/${id}/trace/call/${seq}` }),
  fetchManifest: (id: string) =>
    request.get<{
      items?: Array<{ path?: string; status?: string; failure_class?: string; reason?: string }>
    } | null>({
      url: `/api/v1/review/tasks/${id}/manifest`
    }),
  fetchTaskGate: (id: string) =>
    request.get<{ status: string; gateStatus: string | null; gateDetail: unknown }>({
      url: `/api/v1/review/tasks/${id}/gate`
    }),

  // ---- 红线 ----
  fetchGates: () => request.get<Api.Review.GateRuleItem[]>({ url: '/api/v1/review/gates' }),
  createGate: (data: { repoId?: string; maxCritical?: number | null; maxHigh?: number | null }) =>
    request.post<Api.Review.GateRuleItem>({ url: '/api/v1/review/gates', params: data }),
  updateGate: (id: string, data: { maxCritical?: number | null; maxHigh?: number | null }) =>
    request.put<Api.Review.GateRuleItem>({ url: `/api/v1/review/gates/${id}`, params: data }),
  deleteGate: (id: string) => request.del<null>({ url: `/api/v1/review/gates/${id}` }),

  // ---- 工作台 ----
  fetchDashboardStats: () =>
    request.get<Api.Review.DashboardStats>({ url: '/api/v1/review/dashboard/stats' }),

  // ---- 通知 ----
  fetchNotifs: (params?: { page?: number; pageSize?: number }) =>
    request.get<{ list: Api.Review.NotifItem[]; total: number }>({
      url: '/api/v1/review/notifications',
      params
    }),
  fetchNotifUnread: () =>
    request.get<{ count: number }>({ url: '/api/v1/review/notifications/unread-count' }),
  markNotifRead: (id: string) =>
    request.put<null>({ url: `/api/v1/review/notifications/${id}/read` }),
  markAllNotifRead: () => request.put<null>({ url: '/api/v1/review/notifications/read-all' })
}
