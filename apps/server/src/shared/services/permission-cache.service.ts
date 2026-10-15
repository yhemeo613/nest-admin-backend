import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Status } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisService } from '@/infra/redis/redis.service';
import {
  CacheKey,
  CachePattern,
  PERM_CACHE_TTL_SECONDS,
  PermCacheEvent,
} from '@/shared/constants/cache-key';

/**
 * 用户权限码缓存：
 * - 读：Redis 命中直接返回，未命中查库回填（TTL 30min）；
 * - 写：角色/权限/用户关系变更时通过事件精准失效，变更无需重新登录即可生效。
 */
@Injectable()
export class PermissionCacheService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async getUserPermCodes(userId: string): Promise<Set<string>> {
    const cacheKey = CacheKey.userPerms(userId);
    const cached = await this.redis.getJson<string[]>(cacheKey);
    if (cached) return new Set(cached);

    const userRoles = await this.prisma.sysUserRole.findMany({
      where: { userId, role: { status: Status.ENABLED } },
      include: {
        role: {
          include: {
            perms: { include: { permission: { select: { code: true, status: true } } } },
          },
        },
      },
    });

    const codes = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.perms) {
        if (rp.permission.status === Status.ENABLED) codes.add(rp.permission.code);
      }
    }
    await this.redis.setJson(cacheKey, [...codes], PERM_CACHE_TTL_SECONDS);
    return codes;
  }

  @OnEvent(PermCacheEvent.invalidateUser)
  async invalidateUser(payload: { userId: string }): Promise<void> {
    await this.redis.del(
      CacheKey.userPerms(payload.userId),
      CacheKey.userScope(payload.userId),
      CacheKey.userInfo(payload.userId),
    );
  }

  @OnEvent(PermCacheEvent.invalidateRole)
  async invalidateRole(payload: { roleId: string }): Promise<void> {
    const userRoles = await this.prisma.sysUserRole.findMany({
      where: { roleId: payload.roleId },
      select: { userId: true },
    });
    await Promise.all(userRoles.map((ur) => this.invalidateUser({ userId: ur.userId })));
  }

  @OnEvent(PermCacheEvent.invalidateAll)
  async invalidateAll(): Promise<void> {
    await this.redis.delByPattern(CachePattern.userPermsAll);
    await this.redis.delByPattern(CachePattern.userScopeAll);
    await this.redis.delByPattern(CachePattern.userInfoAll);
  }
}
