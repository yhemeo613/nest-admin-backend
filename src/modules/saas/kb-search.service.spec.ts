import { KbSearchService } from './kb-search.service';

function createService(rows: { id: string; title: string; slug: string; content: string }[]) {
  const prisma = {
    saasKbArticle: { findMany: jest.fn().mockResolvedValue(rows) },
  };
  return { service: new KbSearchService(prisma as never), prisma };
}

describe('KbSearchService（P1 关键词检索）', () => {
  it('无有效检索词时直接返回空，不查库', async () => {
    const { service, prisma } = createService([]);
    const hits = await service.search('？！…', { tenantId: 't1' });
    expect(hits).toEqual([]);
    expect(prisma.saasKbArticle.findMany).not.toHaveBeenCalled();
  });

  it('只检索已发布文章（查询条件带 status/deletedAt），按得分排序', async () => {
    const { service, prisma } = createService([
      { id: 'a1', title: '退货政策', slug: 'return', content: '七天内可以退货，运费自理' },
      { id: 'a2', title: '发货时间', slug: 'shipping', content: '退货请看退货政策页面' },
    ]);

    const hits = await service.search('退货政策', { tenantId: 't1' });

    expect(hits[0].id).toBe('a1'); // 标题全量命中得分最高
    expect(hits[0].title).toBe('退货政策');
    const where = prisma.saasKbArticle.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PUBLISHED');
    expect(where.deletedAt).toBeNull();
    expect(where.tenantId).toBe('t1');
  });

  it('限定 kbId 与条数、预览截断生效', async () => {
    const { service, prisma } = createService([
      { id: 'a1', title: '运费说明', slug: 'fee', content: '运费说明：'.padEnd(2000, '费') },
    ]);

    const hits = await service.search('运费', {
      tenantId: 't1',
      kbId: 'kb1',
      limit: 1,
      previewLength: 20,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].preview.length).toBeLessThanOrEqual(21); // 20 + 省略号
    const where = prisma.saasKbArticle.findMany.mock.calls[0][0].where;
    expect(where.kbId).toBe('kb1');
  });

  it('中文长句按二字切片召回', async () => {
    const { service, prisma } = createService([
      { id: 'a1', title: '发票开具指南', slug: 'invoice', content: '下单后可以申请开具发票' },
    ]);

    await service.search('怎么开发票呢', { tenantId: 't1' });

    const or = prisma.saasKbArticle.findMany.mock.calls[0][0].where.OR as {
      title?: { contains: string };
    }[];
    const terms = or.map((c) => c.title?.contains).filter((t): t is string => Boolean(t));
    expect(terms).toContain('发票');
  });
});
