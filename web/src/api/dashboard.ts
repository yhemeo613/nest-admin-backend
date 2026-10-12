import request from '@/utils/http'

// ==================== 工作台（真实数据） ====================

/** 工作台统计：系统资源计数 + AI 用量指标 */
export function fetchDashboardStats() {
  return request.get<Api.Dashboard.Stats>({ url: '/api/v1/dashboard/stats' })
}

/** 近 N 天 AI 调用趋势（按天补零） */
export function fetchAiTrend(days = 14) {
  return request.get<Api.Dashboard.TrendPoint[]>({
    url: '/api/v1/dashboard/ai-trend',
    params: { days }
  })
}

/** 最近 AI 调用记录 */
export function fetchRecentAiCalls(limit = 8) {
  return request.get<Api.Dashboard.RecentCall[]>({
    url: '/api/v1/dashboard/recent-ai-calls',
    params: { limit }
  })
}
