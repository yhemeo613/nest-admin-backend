import { ReviewGateService } from './review-gate.service';

function createService() {
  const prisma = {
    reviewGateRule: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new ReviewGateService(prisma as never);
  return { service, prisma };
}

describe('ReviewGateService 红线评估', () => {
  beforeEach(() => jest.clearAllMocks());

  it('无任何规则 → SKIPPED', async () => {
    const { service, prisma } = createService();
    prisma.reviewGateRule.findFirst.mockResolvedValue(null);
    const r = await service.evaluate('repo1', { critical: 3, high: 9 });
    expect(r.status).toBe('SKIPPED');
    expect(r.detail?.reasons).toEqual([]);
  });

  it('仓库规则优先于全局规则', async () => {
    const { service, prisma } = createService();
    prisma.reviewGateRule.findFirst
      .mockResolvedValueOnce({ id: 'g1', repoId: 'repo1', maxCritical: 0, maxHigh: 3 })
      .mockResolvedValueOnce({ id: 'g0', repoId: null, maxCritical: 9, maxHigh: 9 });
    // critical:0 在仓库规则(0)下 PASS；若误用全局规则(maxCritical:9/maxHigh:9)同样 PASS，
    // 通过 detail.maxCritical===0 与仅一次查询断言区分命中的是仓库规则
    const r = await service.evaluate('repo1', { critical: 0, high: 1 });
    expect(r.status).toBe('PASS');
    expect(r.detail?.maxCritical).toBe(0); // 用的是仓库规则
    expect(prisma.reviewGateRule.findFirst).toHaveBeenCalledTimes(1);
  });

  it('仓库无规则回落全局规则', async () => {
    const { service, prisma } = createService();
    prisma.reviewGateRule.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'g0', repoId: null, maxCritical: 0, maxHigh: 5 });
    const r = await service.evaluate('repo1', { critical: 1, high: 0 });
    expect(r.status).toBe('FAIL');
    expect(r.detail?.reasons[0]).toContain('critical 问题 1 个');
  });

  it('超限 → FAIL 并给出全部原因；未超限 → PASS', async () => {
    const { service, prisma } = createService();
    prisma.reviewGateRule.findFirst.mockResolvedValue({
      id: 'g1',
      repoId: 'repo1',
      maxCritical: 0,
      maxHigh: 2,
    });

    const fail = await service.evaluate('repo1', { critical: 1, high: 3 });
    expect(fail.status).toBe('FAIL');
    expect(fail.detail?.reasons).toHaveLength(2);

    const pass = await service.evaluate('repo1', { critical: 0, high: 2 });
    expect(pass.status).toBe('PASS');
    expect(pass.detail?.reasons).toEqual([]);
  });

  it('maxCritical=0 是硬性零容忍（不是"不限制"）', async () => {
    const { service, prisma } = createService();
    prisma.reviewGateRule.findFirst.mockResolvedValue({
      id: 'g1',
      repoId: null,
      maxCritical: 0,
      maxHigh: null,
    });
    expect((await service.evaluate('r', { critical: 1, high: 99 })).status).toBe('FAIL');
    expect((await service.evaluate('r', { critical: 0, high: 99 })).status).toBe('PASS');
  });

  it('create：同作用域重复 → REVIEW_GATE_CONFLICT', async () => {
    const { service, prisma } = createService();
    prisma.reviewGateRule.findFirst.mockResolvedValue({ id: 'exists' });
    await expect(service.create({ maxCritical: 0 })).rejects.toMatchObject({ bizCode: 12007 });
  });
});
