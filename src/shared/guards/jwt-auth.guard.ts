import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Status } from '@prisma/client';
import { Request } from 'express';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisService } from '@/infra/redis/redis.service';
import { CacheKey } from '@/shared/constants/cache-key';
import { ErrorCode } from '@/shared/constants/error-code';
import { IS_PUBLIC_KEY } from '@/shared/decorators/public.decorator';
import { BusinessException } from '@/shared/exceptions/business.exception';
import { AccessTokenPayload, AuthUser } from '@/shared/types/auth-user';

const USER_CACHE_TTL_SECONDS = 300;

interface CachedUser {
  id: string;
  username: string;
  nickname: string;
  deptId: string | null;
  isSuper: boolean;
  status: Status;
}

/**
 * 全局认证守卫：
 * 1. @Public() 放行；
 * 2. 校验 AccessToken（JWT）；
 * 3. 读取用户当前状态（Redis 缓存 5min，禁用在缓存失效后最迟 5min 内生效；
 *    重置密码/禁用时会主动删除缓存，立即生效）。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(request);
    if (!token) throw new BusinessException(ErrorCode.UNAUTHORIZED);

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
    } catch {
      throw new BusinessException(ErrorCode.TOKEN_INVALID);
    }

    const user = await this.loadUser(payload.sub);
    if (!user) throw new BusinessException(ErrorCode.UNAUTHORIZED);
    if (user.status !== Status.ENABLED) throw new BusinessException(ErrorCode.USER_DISABLED);

    request.user = {
      userId: user.id,
      username: user.username,
      nickname: user.nickname,
      isSuper: user.isSuper,
      deptId: user.deptId,
    };
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice(7);
  }

  private async loadUser(userId: string): Promise<CachedUser | null> {
    const cacheKey = CacheKey.userInfo(userId);
    const cached = await this.redis.getJson<CachedUser>(cacheKey);
    if (cached) return cached;

    const user = await this.prisma.sysUser.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        username: true,
        nickname: true,
        deptId: true,
        isSuper: true,
        status: true,
      },
    });
    if (user) await this.redis.setJson(cacheKey, user, USER_CACHE_TTL_SECONDS);
    return user;
  }
}
