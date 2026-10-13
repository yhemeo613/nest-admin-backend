/**
 * 权限码常量（唯一事实来源）。
 * 规则：{模块}:{资源}:{动作} 三段小写；装饰器与 seed 只引用常量。
 * 新增权限码需同步 prisma/seed.ts 的 PERMISSION_TREE。
 */
export const PermissionCode = {
  // 菜单级权限码（前端菜单可见性依据，seed 中登记为 MENU 类型）
  Dashboard: 'dashboard',
  AiChatMenu: 'ai:chat',
  // 系统管理 - 用户
  SystemUserList: 'system:user:list',
  SystemUserCreate: 'system:user:create',
  SystemUserUpdate: 'system:user:update',
  SystemUserDelete: 'system:user:delete',
  SystemUserResetPassword: 'system:user:reset-password',
  SystemUserAssignRoles: 'system:user:assign-roles',
  // 系统管理 - 角色
  SystemRoleList: 'system:role:list',
  SystemRoleCreate: 'system:role:create',
  SystemRoleUpdate: 'system:role:update',
  SystemRoleDelete: 'system:role:delete',
  SystemRoleAssignPerms: 'system:role:assign-perms',
  // 系统管理 - 权限点
  SystemPermissionList: 'system:permission:list',
  SystemPermissionCreate: 'system:permission:create',
  SystemPermissionUpdate: 'system:permission:update',
  SystemPermissionDelete: 'system:permission:delete',
  // 系统管理 - 部门
  SystemDeptList: 'system:dept:list',
  SystemDeptCreate: 'system:dept:create',
  SystemDeptUpdate: 'system:dept:update',
  SystemDeptDelete: 'system:dept:delete',
  // AI
  AiChatAsk: 'ai:chat:ask',
  AiChatHistory: 'ai:chat:history',
  AiDocUpload: 'ai:doc:upload',
  AiDocDelete: 'ai:doc:delete',
  AiUsageList: 'ai:usage:list',
  // AI 模型配置（供应商/模型自定义）
  AiConfigMenu: 'ai:config',
  AiConfigList: 'ai:config:list',
  AiConfigCreate: 'ai:config:create',
  AiConfigUpdate: 'ai:config:update',
  AiConfigDelete: 'ai:config:delete',
  // SaaS 多租户运营
  SaasTenantMenu: 'saas:tenant',
  SaasTenantList: 'saas:tenant:list',
  SaasTenantCreate: 'saas:tenant:create',
  SaasTenantUpdate: 'saas:tenant:update',
  SaasTenantDelete: 'saas:tenant:delete',
  SaasApiKeyList: 'saas:apikey:list',
  SaasApiKeyCreate: 'saas:apikey:create',
  SaasApiKeyDelete: 'saas:apikey:delete',
  // SaaS 访客会话
  SaasConversationMenu: 'saas:conversation',
  SaasConversationList: 'saas:conversation:list',
  SaasConversationDetail: 'saas:conversation:detail',
  // SaaS 知识库
  SaasKbMenu: 'saas:kb',
  SaasKbList: 'saas:kb:list',
  SaasKbCreate: 'saas:kb:create',
  SaasKbUpdate: 'saas:kb:update',
  SaasKbDelete: 'saas:kb:delete',
  SaasKbArticleList: 'saas:kb:article:list',
  SaasKbArticleCreate: 'saas:kb:article:create',
  SaasKbArticleUpdate: 'saas:kb:article:update',
  SaasKbArticleDelete: 'saas:kb:article:delete',
  SaasKbTagList: 'saas:kb:tag:list',
  SaasKbTagCreate: 'saas:kb:tag:create',
  SaasKbTagDelete: 'saas:kb:tag:delete',
} as const;

export type PermissionCodeValue = (typeof PermissionCode)[keyof typeof PermissionCode];
