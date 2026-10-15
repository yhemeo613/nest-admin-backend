/** AI 工具调用：名称 → 中文标签（SSE tool 帧展示用） */
export const AI_TOOL_LABELS: Record<string, string> = {
  get_system_overview: '系统概览',
  search_users: '查询用户',
  create_user: '创建用户',
  assign_user_roles: '分配角色',
  list_roles: '查询角色',
  get_dept_tree: '查询部门',
  list_permissions: '查询权限点',
  set_role_permissions: '配置角色权限',
  get_ai_usage: '查询 AI 用量'
}

export const aiToolLabel = (name: string): string => AI_TOOL_LABELS[name] ?? name

/** 工具执行状态类型 */
export type AiToolStatus = 'running' | 'done' | 'error'

export interface AiToolTrace {
  name: string
  status: AiToolStatus
}
