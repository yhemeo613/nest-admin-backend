/**
 * 权限码常量（唯一事实来源）。
 * 规则：{模块}:{资源}:{动作} 三段小写；后端装饰器、prisma/seed.ts 与前端 v-auth 只引用常量。
 * 新增权限码需同步 apps/server/prisma/seed.ts 的 PERMISSION_TREE 并重新执行 prisma:seed。
 */
export const PermissionCode = {
  // 菜单级权限码（前端菜单可见性依据，seed 中登记为 DIR/MENU 类型）
  SystemMenu: 'system',
  SystemUserMenu: 'system:user',
  SystemRoleMenu: 'system:role',
  SystemPermissionMenu: 'system:permission',
  SystemDeptMenu: 'system:dept',
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
  // 代码评审（NestReview）- 菜单级
  ReviewMenu: 'review',
  ReviewDashboardMenu: 'review:dashboard',
  ReviewTaskMenu: 'review:task',
  ReviewRepoMenu: 'review:repo',
  ReviewModelMenu: 'review:model',
  ReviewGateMenu: 'review:gate',
  // 代码评审 - 工作台
  ReviewDashboardQuery: 'review:dashboard:query',
  // 代码评审 - 任务
  ReviewTaskList: 'review:task:list',
  ReviewTaskDetail: 'review:task:detail',
  ReviewTaskCreate: 'review:task:create',
  ReviewTaskCancel: 'review:task:cancel',
  ReviewTaskRerun: 'review:task:rerun',
  ReviewTaskPublish: 'review:task:publish',
  ReviewFindingUpdate: 'review:finding:update',
  // 代码评审 - 仓库
  ReviewRepoList: 'review:repo:list',
  ReviewRepoCreate: 'review:repo:create',
  ReviewRepoEdit: 'review:repo:edit',
  ReviewRepoDelete: 'review:repo:delete',
  ReviewRepoSync: 'review:repo:sync',
  // 代码评审 - 模型配置
  ReviewModelList: 'review:model:list',
  ReviewModelCreate: 'review:model:create',
  ReviewModelEdit: 'review:model:edit',
  ReviewModelDelete: 'review:model:delete',
  ReviewModelTest: 'review:model:test',
  // 代码评审 - 质量红线
  ReviewGateList: 'review:gate:list',
  ReviewGateEdit: 'review:gate:edit',
} as const;

export type PermissionCodeValue = (typeof PermissionCode)[keyof typeof PermissionCode];
