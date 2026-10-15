import { CacheKey } from '@/shared/constants/cache-key';
import { ErrorCode } from '@/shared/constants/error-code';

import { AuthService } from './auth.service';

jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const argon2 = require('argon2') as { verify: jest.Mock; hash: jest.Mock };

function createService() {
  const prisma = {
    sysUser: { findFirst: jest.fn(), update: jest.fn() },
    sysPermission: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const redis = { del: jest.fn(), client: { get: jest.fn(), set: jest.fn() } };
  const service = new AuthService(
    prisma as never,
    redis as never,
    {} as never,
    { get: jest.fn() } as never,
    { getUserPermCodes: jest.fn().mockResolvedValue(new Set()) } as never,
  );
  return { service, prisma, redis };
}

describe('AuthService 自助服务（资料/密码）', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updateProfile：更新指定字段并清用户缓存', async () => {
    const { service, prisma, redis } = createService();
    prisma.sysUser.findFirst.mockResolvedValue({ id: 'u1' });
    prisma.sysUser.update.mockResolvedValue({
      nickname: '新昵称',
      email: 'a@b.c',
      phone: null,
    });

    const result = await service.updateProfile('u1', { nickname: '新昵称', email: 'a@b.c' });

    expect(result.nickname).toBe('新昵称');
    expect(prisma.sysUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { nickname: '新昵称', email: 'a@b.c' },
      }),
    );
    expect(redis.del).toHaveBeenCalledWith(CacheKey.userInfo('u1'));
  });

  it('changePassword：旧密码错误抛 OLD_PASSWORD_WRONG，不改密', async () => {
    const { service, prisma } = createService();
    prisma.sysUser.findFirst.mockResolvedValue({ id: 'u1', password: 'hash-old' });
    argon2.verify.mockResolvedValue(false);

    await expect(
      service.changePassword('u1', { oldPassword: 'wrong', newPassword: 'NewPass@1' }),
    ).rejects.toMatchObject({ bizCode: ErrorCode.OLD_PASSWORD_WRONG });
    expect(prisma.sysUser.update).not.toHaveBeenCalled();
  });

  it('changePassword：成功时改密并吊销刷新令牌与用户缓存（强制下线）', async () => {
    const { service, prisma, redis } = createService();
    prisma.sysUser.findFirst.mockResolvedValue({
      id: 'u1',
      username: 'admin',
      password: 'hash-old',
    });
    argon2.verify.mockResolvedValue(true);
    argon2.hash.mockResolvedValue('hash-new');

    const result = await service.changePassword('u1', {
      oldPassword: 'OldPass@1',
      newPassword: 'NewPass@1',
    });

    expect(result).toBeNull();
    expect(prisma.sysUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { password: 'hash-new' } }),
    );
    expect(redis.del).toHaveBeenCalledWith(CacheKey.refreshToken('u1'));
    expect(redis.del).toHaveBeenCalledWith(CacheKey.userInfo('u1'));
  });

  it('changePassword：新旧密码相同时拒绝', async () => {
    const { service, prisma } = createService();
    prisma.sysUser.findFirst.mockResolvedValue({ id: 'u1', password: 'hash' });
    argon2.verify.mockResolvedValue(true);

    await expect(
      service.changePassword('u1', { oldPassword: 'same123', newPassword: 'same123' }),
    ).rejects.toMatchObject({ bizCode: ErrorCode.BAD_REQUEST });
  });
});
