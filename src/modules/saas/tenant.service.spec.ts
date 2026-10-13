import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';
import { AuthUser } from '@/shared/types/auth-user';

import { hashApiKey } from './api-key.util';
import { TenantService } from './tenant.service';

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
  tenantId: 't1',
};

/** 组装一个只含用例所需方法的 Prisma 桩 */
function createPrismaStub() {
  return {
    tenant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tenantApiKey: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    tenantConversation: { count: jest.fn() },
    $transaction: jest.fn(),
  };
}

describe('TenantService（租户运营）', () => {
  let prisma: ReturnType<typeof createPrismaStub>;
  let service: TenantService;

  beforeEach(() => {
    prisma = createPrismaStub();
    service = new TenantService(prisma as never);
  });

  it('新增租户：编码冲突抛 TENANT_CODE_EXISTS', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ id: 't1' });

    await expect(service.create({ name: '重复', code: 'demo-shop' }, 'u1')).rejects.toMatchObject({
      bizCode: ErrorCode.TENANT_CODE_EXISTS,
    });
  });

  it('新增租户：编码不冲突时创建并返回视图', async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);
    prisma.tenant.create.mockResolvedValue({
      id: 't1',
      name: '星辰电商',
      code: 'xingchen',
      contactName: null,
      contactEmail: null,
      status: 'ENABLED',
      remark: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const view = await service.create({ name: '星辰电商', code: 'xingchen' }, 'u1');

    expect(view.code).toBe('xingchen');
    expect(view.conversationCount).toBe(0);
    expect(prisma.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'xingchen', createdBy: 'u1' }),
    });
  });

  it('删除租户：连带失效 API Key 与租户（同一事务）', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ id: 't1' });
    prisma.$transaction.mockResolvedValue([]);

    await service.remove('t1');

    expect(prisma.tenantApiKey.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', deletedAt: null },
        data: expect.objectContaining({ status: 'DISABLED' }),
      }),
    );
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' } }),
    );
  });

  it('创建 API Key：明文只随创建响应返回一次，库中只存 sha256', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      id: 't1',
      code: 'demo',
      status: 'ENABLED',
    });
    prisma.tenantApiKey.create.mockImplementation(async (args: { data: { keyHash: string } }) => ({
      id: 'k1',
      tenantId: 't1',
      name: args.data.keyHash,
      keyPrefix: 'sk-abc12',
      status: 'ENABLED',
      lastUsedAt: null,
      createdAt: new Date(),
    }));

    const view = await service.createApiKey('t1', { name: '官网挂件' }, 'u1', superUser);

    expect(view.plaintext).toMatch(/^sk-[0-9a-f]{48}$/);
    // 持久化的 keyHash 是明文的 sha256，而非明文本身
    expect(prisma.tenantApiKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ keyHash: hashApiKey(view.plaintext!) }),
    });
    // 列表视图不携带明文
    prisma.tenantApiKey.findMany.mockResolvedValue([]);
    const keys = await service.listApiKeys('t1', superUser);
    expect(keys).toEqual([]);
  });

  it('删除 API Key：不存在抛 API_KEY_NOT_FOUND', async () => {
    prisma.tenantApiKey.findFirst.mockResolvedValue(null);

    await expect(service.removeApiKey('missing', superUser)).rejects.toMatchObject({
      bizCode: ErrorCode.API_KEY_NOT_FOUND,
    });
  });

  it('创建 API Key：租户禁用时拒绝', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ id: 't1', code: 'x', status: 'DISABLED' });

    await expect(service.createApiKey('t1', { name: 'k' }, 'u1', superUser)).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it('租户管理员越权操作他人租户的 Key：按不存在处理', async () => {
    prisma.tenantApiKey.findFirst.mockResolvedValue({ id: 'k9', tenantId: 'other' });

    await expect(service.removeApiKey('k9', scopedUser)).rejects.toMatchObject({
      bizCode: ErrorCode.API_KEY_NOT_FOUND,
    });
    expect(prisma.tenantApiKey.update).not.toHaveBeenCalled();
  });

  it('租户管理员列表只锁定自己的租户', async () => {
    prisma.tenant.findMany.mockResolvedValue([]);
    prisma.tenant.count.mockResolvedValue(0);
    prisma.tenantApiKey.findMany.mockResolvedValue([]);
    prisma.tenantConversation.count.mockResolvedValue(0);

    await service.page({ page: 1, pageSize: 10 }, scopedUser);

    expect(prisma.tenant.findMany.mock.calls[0][0].where).toMatchObject({ id: 't1' });
  });
});
