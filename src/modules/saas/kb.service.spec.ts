import { ErrorCode } from '@/shared/constants/error-code';
import { AuthUser } from '@/shared/types/auth-user';

import { KbService } from './kb.service';

const superUser: AuthUser = {
  userId: 'u1',
  username: 'admin',
  nickname: '管理员',
  isSuper: true,
  deptId: null,
};

const scopedUser: AuthUser = {
  userId: 'u2',
  username: 'boss',
  nickname: '租户管理员',
  isSuper: false,
  deptId: null,
  tenantId: 't-mine',
};

function createService() {
  const prisma = {
    saasKb: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    saasKbArticle: { groupBy: jest.fn().mockResolvedValue([]) },
    saasKbTag: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    tenant: { findFirst: jest.fn() },
  };
  return { prisma, service: new KbService(prisma as never) };
}

describe('KbService 租户隔离', () => {
  it('租户管理员列表强制锁定自己的租户（忽略入参 tenantId）', async () => {
    const { prisma, service } = createService();
    prisma.saasKb.findMany.mockResolvedValue([]);
    prisma.saasKb.count.mockResolvedValue(0);

    await service.page({ page: 1, pageSize: 10, tenantId: 't-other' }, scopedUser);

    expect(prisma.saasKb.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't-mine' });
  });

  it('租户管理员为他人租户建库：抛 FORBIDDEN', async () => {
    const { service } = createService();

    await expect(
      service.create({ tenantId: 't-other', name: '越权库' }, scopedUser),
    ).rejects.toMatchObject({ bizCode: ErrorCode.FORBIDDEN });
  });

  it('访问他人租户的库：按不存在处理（requireKb）', async () => {
    const { prisma, service } = createService();
    prisma.saasKb.findFirst.mockResolvedValue({ id: 'kb1', tenantId: 't-other', deletedAt: null });

    await expect(service.listTags('kb1', scopedUser)).rejects.toMatchObject({
      bizCode: ErrorCode.NOT_FOUND,
    });
  });

  it('超管不受租户过滤限制', async () => {
    const { prisma, service } = createService();
    prisma.saasKb.findMany.mockResolvedValue([]);
    prisma.saasKb.count.mockResolvedValue(0);

    await service.page({ page: 1, pageSize: 10 }, superUser);

    expect(prisma.saasKb.findMany.mock.calls[0][0].where.tenantId).toBeUndefined();
  });
});
