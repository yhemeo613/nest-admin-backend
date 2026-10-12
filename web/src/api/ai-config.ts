import request from '@/utils/http'

// ==================== AI 模型配置（供应商/模型） ====================

/** 供应商配置列表（apiKey 掩码返回） */
export function fetchAiProviders() {
  return request.get<Api.AiConfig.ProviderItem[]>({ url: '/api/v1/ai/providers' })
}

/** 新增供应商（可携带模型列表） */
export function fetchCreateAiProvider(data: Api.AiConfig.ProviderPayload) {
  return request.post<Api.AiConfig.ProviderItem>({ url: '/api/v1/ai/providers', params: data })
}

/** 修改供应商（models 整体替换；apiKey 缺省保留原值） */
export function fetchUpdateAiProvider(id: string, data: Partial<Api.AiConfig.ProviderPayload>) {
  return request.put<Api.AiConfig.ProviderItem>({
    url: `/api/v1/ai/providers/${id}`,
    params: data
  })
}

/** 删除供应商（软删除） */
export function fetchDeleteAiProvider(id: string) {
  return request.del<null>({ url: `/api/v1/ai/providers/${id}` })
}

/** 从端点自动发现模型列表（OpenAI 兼容 /models 或 Ollama /api/tags） */
export function fetchRemoteModels(data: {
  baseUrl: string
  apiKey?: string
  protocol: Api.AiConfig.Protocol
}) {
  return request.post<{ ids: string[] }>({
    url: '/api/v1/ai/providers/fetch-models',
    params: data
  })
}

/** 对话页可用模型列表（含全局默认模型） */
export function fetchAiChatModels() {
  return request.get<Api.AiConfig.ChatModelsResponse>({ url: '/api/v1/ai/models' })
}
