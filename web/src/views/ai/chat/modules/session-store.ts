/**
 * AI 对话会话本地持久化（localStorage，按用户隔离）。
 * 服务端历史接口规划中（后端权限码 ai:chat:history 已预留），当前版本先本地保存。
 */

import type { AiToolTrace } from '@/utils/ai-tools'

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Agent 工具调用轨迹（SSE tool 帧） */
  tools?: AiToolTrace[]
  /** 实际命中的模型（结束帧下发） */
  model?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null
  createdAt: number
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** 会话使用的模型配置 ID（AiModel.id） */
  modelId?: string
  messages: ChatMessageItem[]
}

const storageKey = (userId: string) => `ai-chat:sessions:${userId}`
const modelKey = (userId: string) => `ai-chat:model:${userId}`

export function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function loadSessions(userId: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const list = JSON.parse(raw) as ChatSession[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveSessions(userId: string, sessions: ChatSession[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(sessions))
  } catch {
    /* 超额/隐私模式下静默失败 */
  }
}

/** 首条用户消息截断生成会话标题 */
export function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 24 ? `${t.slice(0, 24)}…` : t || '新对话'
}

export function loadModelId(userId: string): string | undefined {
  return localStorage.getItem(modelKey(userId)) ?? undefined
}

export function saveModelId(userId: string, modelId: string | undefined): void {
  if (modelId) localStorage.setItem(modelKey(userId), modelId)
  else localStorage.removeItem(modelKey(userId))
}

/** 分组：今天 / 昨天 / 近 7 天 / 更早 */
export function groupSessions(list: ChatSession[]): { label: string; items: ChatSession[] }[] {
  const now = Date.now()
  const DAY = 86_400_000
  const groups: Record<string, ChatSession[]> = { 今天: [], 昨天: [], '近 7 天': [], 更早: [] }
  const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  for (const s of sorted) {
    const diff = now - s.updatedAt
    if (diff < DAY) groups.今天.push(s)
    else if (diff < 2 * DAY) groups.昨天.push(s)
    else if (diff < 7 * DAY) groups['近 7 天'].push(s)
    else groups.更早.push(s)
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, items }))
}
