import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { ErrorCode } from '@/shared/constants/error-code';
import { IS_PUBLIC_KEY } from '@/shared/decorators/public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '@/shared/decorators/require-permissions.decorator';
import { BusinessException } from '@/shared/exceptions/business.exception';
import { PermissionCacheService } from '@/shared/services/permission-cache.service';
import { AuthUser } from '@/shared/types/auth-user';

/**
 * 全局权限守卫（JwtAuthGuard 之后执行）：
 * - @Public() 或未标注 @RequirePermissions 的接口：登录即放行；
 * - 超级管理员放行；
 * - 其余接口校验权限码集合（命中任一即放行）。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permCache: PermissionCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) throw new BusinessException(ErrorCode.UNAUTHORIZED);
    if (user.isSuper) return true;

    const owned = await this.permCache.getUserPermCodes(user.userId);
    if (required.some((code) => owned.has(code))) return true;
    throw new BusinessException(ErrorCode.FORBIDDEN);
  }
}
