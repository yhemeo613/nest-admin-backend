import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthUser } from '@/shared/types/auth-user';

/**
 * 获取当前登录用户。
 * 用法：@CurrentUser() user: AuthUser 或 @CurrentUser('userId') userId: string
 */
export const CurrentUser = createParamDecorator(
  (key: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) return undefined;
    return key ? user[key] : user;
  },
);
