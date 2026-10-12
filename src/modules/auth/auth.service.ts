import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PermType, Status } from '@prisma/client';
import * as argon2 from 'argon2';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisService } from '@/infra/redis/redis.service';
import { CacheKey } from '@/shared/constants/cache-key';
import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';
import { PermissionCacheService } from '@/shared/services/permission-cache.service';
import { RefreshTokenPayload } from '@/shared/types/auth-user';
import { buildTree } from '@/shared/utils/tree.util';

import { LoginDto } from './dto/login.dto';
import { ProfileDto, ProfileMenuDto, TokenPairDto } from './dto/profile.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly permCache: PermissionCacheService,
  ) {}

  /** 登录：校验密码 → 签发双 Token（Refresh 凭据存 Redis，可踢人） */
  async login(dto: LoginDto): Promise<TokenPairDto> {
    const user = await this.prisma.sysUser.findFirst({
      where: { username: dto.username, deletedAt: null },
    });
    // 统一模糊报错，避免暴露"用户不存在"信息
    if (!user) throw new BusinessException(ErrorCode.LOGIN_FAILED);
    if (user.status !== Status.ENABLED) throw new BusinessException(ErrorCode.USER_DISABLED);

    const passwordOk = await argon2.verify(user.password, dto.password).catch(() => false);
    if (!passwordOk) throw new BusinessException(ErrorCode.LOGIN_FAILED);

    this.logger.log(`用户登录成功: ${user.username}(${user.id})`);
    return this.issueTokens(user.id, user.username, user.isSuper);
  }

  /** 刷新：校验 Refresh Token + Redis 中的 jti 一致性，旧凭据即刻作废（旋转） */
  async refresh(dto: RefreshTokenDto): Promise<TokenPairDto> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(dto.refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new BusinessException(ErrorCode.TOKEN_INVALID);
    }

    const storedJti = await this.redis.client.get(CacheKey.refreshToken(payload.sub));
    if (!storedJti || storedJti !== payload.jti) {
      throw new BusinessException(ErrorCode.TOKEN_INVALID, '刷新令牌已失效，请重新登录');
    }

    const user = await this.prisma.sysUser.findFirst({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user) throw new BusinessException(ErrorCode.UNAUTHORIZED);
    if (user.status !== Status.ENABLED) throw new BusinessException(ErrorCode.USER_DISABLED);

    return this.issueTokens(user.id, user.username, user.isSuper);
  }

  /** 登出：吊销 Refresh 凭据 */
  async logout(userId: string): Promise<void> {
    await this.redis.del(CacheKey.refreshToken(userId));
  }

  /** 当前用户档案：用户信息 + 角色编码 + 权限码集合 + 菜单树（驱动前端路由与按钮显隐） */
  async profile(userId: string): Promise<ProfileDto> {
    const user = await this.prisma.sysUser.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      include: {
        roles: { include: { role: true } },
      },
    });

    const roles = user.roles
      .map((ur) => ur.role)
      .filter((r) => r.status === Status.ENABLED)
      .map((r) => r.code);

    const permCodes = user.isSuper
      ? await this.getAllPermCodes()
      : [...(await this.permCache.getUserPermCodes(userId))];

    const menus = await this.getMenus(user.isSuper ? null : new Set(permCodes));

    return {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        deptId: user.deptId,
        isSuper: user.isSuper,
      },
      roles,
      permissions: permCodes,
      menus,
    };
  }

  private async issueTokens(
    userId: string,
    username: string,
    isSuper: boolean,
  ): Promise<TokenPairDto> {
    const accessTtl = this.config.get<number>('jwt.accessTtlSeconds', 7200);
    const refreshTtl = this.config.get<number>('jwt.refreshTtlSeconds', 604800);

    const accessToken = await this.jwtService.signAsync({
      sub: userId,
      username,
      isSuper,
    });

    const jti = randomUUID();
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, jti },
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: refreshTtl },
    );
    // 单点控制：同一用户仅保留最新 jti，旧 Refresh Token 立即失效
    await this.redis.client.set(CacheKey.refreshToken(userId), jti, 'EX', refreshTtl);

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  private async getAllPermCodes(): Promise<string[]> {
    const perms = await this.prisma.sysPermission.findMany({
      where: { status: Status.ENABLED },
      select: { code: true },
    });
    return perms.map((p) => p.code);
  }

  /** 菜单树：超管取全部；普通用户取拥有权限码的目录/菜单及其祖先链 */
  private async getMenus(ownedCodes: Set<string> | null): Promise<ProfileMenuDto[]> {
    const all = await this.prisma.sysPermission.findMany({
      where: { status: Status.ENABLED, type: { in: [PermType.DIR, PermType.MENU] } },
      orderBy: { sort: 'asc' },
    });

    const visible = ownedCodes === null ? all : this.filterWithAncestors(all, ownedCodes);

    const tree = buildTree(visible);
    return tree as unknown as ProfileMenuDto[];
  }

  private filterWithAncestors<T extends { id: string; parentId: string | null; code: string }>(
    all: T[],
    ownedCodes: Set<string>,
  ): T[] {
    const byId = new Map(all.map((p) => [p.id, p]));
    const kept = new Set<string>();
    for (const p of all) {
      if (!ownedCodes.has(p.code)) continue;
      // 保留自身及全部祖先，保证树不断链
      let cursor: T | undefined = p;
      while (cursor && !kept.has(cursor.id)) {
        kept.add(cursor.id);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
    }
    return all.filter((p) => kept.has(p.id));
  }
}
