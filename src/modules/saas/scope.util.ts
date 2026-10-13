import { AuthUser } from '@/shared/types/auth-user';

/**
 * 租户管理员数据隔离锚点：
 * 超管/平台员工（无 ownerTenantId）返回 null 表示不限制；
 * 自助注册的租户管理员返回其归属租户 ID，服务层必须强制过滤。
 */
export function dataScopeOf(user: AuthUser): string | null {
  return user.isSuper ? null : (user.tenantId ?? null);
}
