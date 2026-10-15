import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { BusinessException } from '@/shared/exceptions/business.exception';
import { AuthUser } from '@/shared/types/auth-user';

import { PermissionsGuard } from './permissions.guard';

function mockContext(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard（权限守卫）', () => {
  let guard: PermissionsGuard;
  let reflector: jest.Mocked<Reflector>;
  let permCache: { getUserPermCodes: jest.Mock };

  const normalUser: AuthUser = {
    userId: 'u1',
    username: 'demo',
    nickname: '演示',
    isSuper: false,
    deptId: null,
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    permCache = { getUserPermCodes: jest.fn() };
    guard = new PermissionsGuard(reflector, permCache as never);
  });

  it('@Public() 接口直接放行', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true); // isPublic
    await expect(guard.canActivate(mockContext())).resolves.toBe(true);
  });

  it('未标注权限码的接口：登录即放行', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // isPublic
      .mockReturnValueOnce(undefined); // required permissions
    await expect(guard.canActivate(mockContext(normalUser))).resolves.toBe(true);
  });

  it('超级管理员绕过权限校验', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['system:user:delete']);
    const superUser: AuthUser = { ...normalUser, isSuper: true };
    await expect(guard.canActivate(mockContext(superUser))).resolves.toBe(true);
    expect(permCache.getUserPermCodes).not.toHaveBeenCalled();
  });

  it('拥有权限码时放行', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['system:user:list']);
    permCache.getUserPermCodes.mockResolvedValue(new Set(['system:user:list', 'ai:chat:ask']));
    await expect(guard.canActivate(mockContext(normalUser))).resolves.toBe(true);
  });

  it('无权限码时抛出 40301', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['system:user:delete']);
    permCache.getUserPermCodes.mockResolvedValue(new Set(['system:user:list']));
    await expect(guard.canActivate(mockContext(normalUser))).rejects.toBeInstanceOf(
      BusinessException,
    );
  });
});
