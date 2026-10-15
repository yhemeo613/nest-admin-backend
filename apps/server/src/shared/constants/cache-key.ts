/** Redis 缓存键与权限缓存失效事件（统一管理，避免散落字面量） */
export const CacheKey = {
  userPerms: (userId: string) => `auth:perms:${userId}`,
  userScope: (userId: string) => `auth:scope:${userId}`,
  userInfo: (userId: string) => `auth:user:${userId}`,
  refreshToken: (userId: string) => `auth:refresh:${userId}`,
} as const;

export const CachePattern = {
  userPermsAll: 'auth:perms:*',
  userScopeAll: 'auth:scope:*',
  userInfoAll: 'auth:user:*',
} as const;

export const PermCacheEvent = {
  /** 用户维度失效：assignRoles / 禁用 / 删除用户 */
  invalidateUser: 'auth.perms.invalidateUser',
  /** 角色维度失效：角色权限/数据范围变更、角色禁用 */
  invalidateRole: 'auth.perms.invalidateRole',
  /** 全量失效：权限点本身被修改/删除 */
  invalidateAll: 'auth.perms.invalidateAll',
} as const;

export const PERM_CACHE_TTL_SECONDS = 1800;
