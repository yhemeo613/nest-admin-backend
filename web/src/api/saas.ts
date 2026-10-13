import request from '@/utils/http'

// ==================== 租户 ====================

/** 租户分页列表 */
export function fetchGetTenantPage(params: Api.Saas.TenantSearchParams) {
  return request.get<Api.Saas.TenantList>({ url: '/api/v1/saas/tenants', params })
}

/** 新增租户 */
export function fetchCreateTenant(data: {
  name: string
  code: string
  contactName?: string
  contactEmail?: string
  remark?: string
}) {
  return request.post<Api.Saas.TenantItem>({ url: '/api/v1/saas/tenants', params: data })
}

/** 修改租户 */
export function fetchUpdateTenant(
  id: string,
  data: Partial<{
    name: string
    code: string
    contactName: string
    contactEmail: string
    status: Api.Common.EnableStatus
    remark: string
  }>
) {
  return request.put<Api.Saas.TenantItem>({ url: `/api/v1/saas/tenants/${id}`, params: data })
}

/** 删除租户（软删除，API Key 连带失效） */
export function fetchDeleteTenant(id: string) {
  return request.del<null>({ url: `/api/v1/saas/tenants/${id}` })
}

// ==================== 租户 API Key ====================

/** 租户的 API Key 列表（不含明文） */
export function fetchGetApiKeyList(tenantId: string) {
  return request.get<Api.Saas.ApiKeyItem[]>({ url: `/api/v1/saas/tenants/${tenantId}/api-keys` })
}

/** 创建 API Key（plaintext 只在本次响应返回） */
export function fetchCreateApiKey(tenantId: string, name: string) {
  return request.post<Api.Saas.ApiKeyItem>({
    url: `/api/v1/saas/tenants/${tenantId}/api-keys`,
    params: { name }
  })
}

/** 删除 API Key（软删除，立即失效） */
export function fetchDeleteApiKey(id: string) {
  return request.del<null>({ url: `/api/v1/saas/api-keys/${id}` })
}

// ==================== 访客会话 ====================

/** 访客会话分页列表 */
export function fetchGetConversationPage(params: Api.Saas.ConversationSearchParams) {
  return request.get<Api.Saas.ConversationList>({ url: '/api/v1/saas/conversations', params })
}

/** 会话详情（含全部消息） */
export function fetchGetConversationDetail(id: string) {
  return request.get<Api.Saas.ConversationDetail>({ url: `/api/v1/saas/conversations/${id}` })
}

// ==================== 知识库 ====================

/** 知识库分页列表 */
export function fetchGetKbPage(params: Api.Saas.KbSearchParams) {
  return request.get<Api.Saas.KbList>({ url: '/api/v1/saas/kbs', params })
}

/** 新增知识库 */
export function fetchCreateKb(data: {
  tenantId: string
  name: string
  description?: string
  sort?: number
}) {
  return request.post<Api.Saas.KbItem>({ url: '/api/v1/saas/kbs', params: data })
}

/** 修改知识库 */
export function fetchUpdateKb(
  id: string,
  data: Partial<{ name: string; description: string; sort: number; status: Api.Saas.KbStatus }>
) {
  return request.put<null>({ url: `/api/v1/saas/kbs/${id}`, params: data })
}

/** 删除知识库（软删除） */
export function fetchDeleteKb(id: string) {
  return request.del<null>({ url: `/api/v1/saas/kbs/${id}` })
}

/** 库内文章分页列表 */
export function fetchGetArticlePage(kbId: string, params: Api.Saas.ArticleSearchParams) {
  return request.get<Api.Saas.ArticleList>({ url: `/api/v1/saas/kbs/${kbId}/articles`, params })
}

/** 新增文章 */
export function fetchCreateArticle(kbId: string, data: Api.Saas.ArticlePayload) {
  return request.post<Api.Saas.ArticleItem>({
    url: `/api/v1/saas/kbs/${kbId}/articles`,
    params: data
  })
}

/** 文章详情（含正文） */
export function fetchGetArticleDetail(articleId: string) {
  return request.get<Api.Saas.ArticleDetail>({ url: `/api/v1/saas/kbs/articles/${articleId}` })
}

/** 修改文章 */
export function fetchUpdateArticle(articleId: string, data: Api.Saas.ArticlePayload) {
  return request.put<Api.Saas.ArticleItem>({
    url: `/api/v1/saas/kbs/articles/${articleId}`,
    params: data
  })
}

/** 删除文章 */
export function fetchDeleteArticle(articleId: string) {
  return request.del<null>({ url: `/api/v1/saas/kbs/articles/${articleId}` })
}

/** 库内标签列表 */
export function fetchGetKbTags(kbId: string) {
  return request.get<Api.Saas.KbTag[]>({ url: `/api/v1/saas/kbs/${kbId}/tags` })
}

/** 新增标签 */
export function fetchCreateKbTag(kbId: string, name: string) {
  return request.post<Api.Saas.KbTag>({ url: `/api/v1/saas/kbs/${kbId}/tags`, params: { name } })
}

/** 删除标签 */
export function fetchDeleteKbTag(tagId: string) {
  return request.del<null>({ url: `/api/v1/saas/kbs/tags/${tagId}` })
}
