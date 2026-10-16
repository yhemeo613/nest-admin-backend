import { Status } from '@prisma/client';

import { ModelProtocol } from './dto/review-model.dto';
import { ReviewModelService } from './review-model.service';

function createService() {
  const txMock = {
    reviewModel: { updateMany: jest.fn(), create: jest.fn() },
  };
  const prisma = {
    // Prisma $transaction 两种形态：数组（Promise.all）与回调（tx）
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: never) => unknown)(txMock as never)
        : Promise.all(arg as Promise<unknown>[]),
    ),
    reviewModel: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    reviewTask: { count: jest.fn().mockResolvedValue(0) },
  };
  const crypto = {
    encrypt: jest.fn((s: string) => `v1:enc(${s})`),
    decrypt: jest.fn((s: string) => s.replace('v1:enc(', '').replace(')', '')),
  };
  const service = new ReviewModelService(prisma as never, crypto as never);
  return { service, prisma, txMock, crypto };
}

describe('ReviewModelService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('create：isDefault 时同事务清空其他默认；apiKey 加密落库', async () => {
    const { service, txMock, crypto } = createService();
    txMock.reviewModel.create.mockResolvedValue({
      id: 'm1',
      name: 'MiMo',
      provider: 'openai',
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      model: 'mimo-v2.5',
      extraBody: null,
      isDefault: true,
      status: Status.ENABLED,
      apiKeyEnc: 'v1:enc(sk-123)',
      createdBy: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const r = await service.create(
      {
        name: 'MiMo',
        provider: 'openai',
        protocol: ModelProtocol.OPENAI,
        baseUrl: 'https://api.example.com/v1/',
        apiKey: 'sk-123',
        model: 'mimo-v2.5',
        isDefault: true,
      },
      'u1',
    );

    expect(crypto.encrypt).toHaveBeenCalledWith('sk-123');
    expect(txMock.reviewModel.updateMany).toHaveBeenCalledWith({ data: { isDefault: false } });
    expect(txMock.reviewModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          apiKeyEnc: 'v1:enc(sk-123)',
          baseUrl: 'https://api.example.com/v1', // 尾部斜杠被去除
          createdBy: 'u1',
        }),
      }),
    );
    expect(r.isDefault).toBe(true);
  });

  it('toResponse 不泄漏 apiKey，只暴露 hasApiKey', async () => {
    const { service, prisma } = createService();
    prisma.reviewModel.findMany.mockResolvedValue([
      {
        id: 'm1',
        name: 'x',
        provider: 'openai',
        protocol: 'openai',
        baseUrl: 'https://a',
        model: 'm',
        extraBody: { thinking: { type: 'enabled' } },
        isDefault: false,
        status: Status.ENABLED,
        apiKeyEnc: 'v1:xxx',
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    prisma.reviewModel.count.mockResolvedValue(1);

    const r = await service.findAll({ page: 1, pageSize: 20 });
    expect(r.total).toBe(1);
    expect(r.list[0].hasApiKey).toBe(true);
    expect(JSON.stringify(r.list[0])).not.toContain('apiKeyEnc');
    expect(JSON.stringify(r.list[0])).not.toContain('v1:xxx');
  });

  it('getDefault：无默认时回落最早可用模型', async () => {
    const { service, prisma } = createService();
    prisma.reviewModel.findFirst
      .mockResolvedValueOnce(null) // 无 isDefault
      .mockResolvedValueOnce({ id: 'm2' }); // 回落
    const model = await service.getDefault();
    expect(model?.id).toBe('m2');
    expect(prisma.reviewModel.findFirst).toHaveBeenCalledTimes(2);
  });

  it('remove：默认模型不可删；被进行中任务引用不可删', async () => {
    const { service, prisma } = createService();
    prisma.reviewModel.findFirst.mockResolvedValue({ id: 'm1', isDefault: true });
    await expect(service.remove('m1')).rejects.toMatchObject({ bizCode: 40900 });

    prisma.reviewModel.findFirst.mockResolvedValue({ id: 'm2', isDefault: false });
    prisma.reviewTask.count.mockResolvedValueOnce(1);
    await expect(service.remove('m2')).rejects.toMatchObject({ bizCode: 40900 });
  });
});
