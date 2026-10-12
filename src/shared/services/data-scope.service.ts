import { Injectable } from '@nestjs/common';
import { DataScope, Status } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisService } from '@/infra/redis/redis.service';
import { CacheKey, PERM_CACHE_TTL_SECONDS } from '@/shared/constants/cache-key';
import { ResolvedDataScopeOptions } from '@/shared/decorators/data-scope.decorator';
import { AuthUser } from '@/shared/types/auth-user';

interface RoleScopeInfo {
  dataScope: DataScope;
  /** CUSTOM 范围时配置的部门集合 */
  deptIds: string[];
}

/**
 * 数据行级权限：将当前用户所有角色的 dataScope 取并集，
 * 生成 Prisma where 片段（部门条件与本人条件为 OR 关系）。
 */
@Injectable()
export class DataScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async buildFilter(
    user: AuthUser,
    options: ResolvedDataScopeOptions,
  ): Promise<Record<string, unknown>> {
    if (user.isSuper) return {};

    const roles = await this.getUserRoleScopes(user.userId);
    if (roles.some((r) => r.dataScope === DataScope.ALL)) return {};

    const deptIds = new Set<string>();
    let includeSelf = false;

    for (const role of roles) {
      switch (role.dataScope) {
        case DataScope.DEPT_AND_CHILDREN: {
          if (user.deptId) {
            deptIds.add(user.deptId);
            const children = await this.prisma.sysDept.findMany({
              where: { ancestors: { contains: `,${user.deptId},` } },
              select: { id: true },
            });
            children.forEach((c) => deptIds.add(c.id));
          }
          break;
        }
        case DataScope.DEPT: {
          if (user.deptId) deptIds.add(user.deptId);
          break;
        }
        case DataScope.CUSTOM: {
          role.deptIds.forEach((id) => deptIds.add(id));
          break;
        }
        case DataScope.SELF: {
          includeSelf = true;
          break;
        }
      }
    }

    const or: Record<string, unknown>[] = [];
    if (deptIds.size > 0) or.push({ [options.deptField]: { in: [...deptIds] } });
    if (includeSelf) or.push({ [options.ownerField]: user.userId });

    // 用户未配置任何有效范围时兜底为"仅本人"，宁可收紧不可放大
    if (or.length === 0) return { [options.ownerField]: user.userId };
    return { OR: or };
  }

  private async getUserRoleScopes(userId: string): Promise<RoleScopeInfo[]> {
    const cacheKey = CacheKey.userScope(userId);
    const cached = await this.redis.getJson<RoleScopeInfo[]>(cacheKey);
    if (cached) return cached;

    const userRoles = await this.prisma.sysUserRole.findMany({
      where: { userId, role: { status: Status.ENABLED } },
      include: { role: { include: { depts: true } } },
    });
    const scopes: RoleScopeInfo[] = userRoles.map((ur) => ({
      dataScope: ur.role.dataScope,
      deptIds: ur.role.depts.map((d) => d.deptId),
    }));
    await this.redis.setJson(cacheKey, scopes, PERM_CACHE_TTL_SECONDS);
    return scopes;
  }
}
