import { OcrResultJson } from './parsers/ocr-types';
import { ReviewTaskService } from './review-task.service';

function createService() {
  const createdFindings: unknown[] = [];
  const txMock = {
    reviewFinding: {
      createMany: jest.fn(({ data }: { data: unknown[] }) => {
        createdFindings.push(...data);
        return Promise.resolve({ count: data.length });
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    reviewTraceCall: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: never) => unknown)(txMock as never)
        : Promise.all(arg as Promise<unknown>[]),
    ),
    reviewFinding: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    reviewTask: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const queue = { removePending: jest.fn().mockResolvedValue(false), enqueue: jest.fn() };
  const executor = { cancel: jest.fn().mockReturnValue(true) };
  const events = { publish: jest.fn() };
  const service = new ReviewTaskService(
    prisma as never,
    queue as never,
    {} as never, // repoService
    {} as never, // modelService
    {} as never, // mrIntegration
    {} as never, // crypto
    executor as never,
    events as never,
  );
  return { service, prisma, queue, executor, txMock, createdFindings };
}

const baseResult: OcrResultJson = {
  status: 'success',
  summary: { files_reviewed: 2, comments: 2, total_tokens: 1000 },
  comments: [
    {
      path: 'src/a.ts',
      content: '空指针风险',
      start_line: 10,
      end_line: 12,
      category: 'bug',
      severity: 'critical',
    },
    {
      path: 'src/b.ts',
      content: '命名不规范',
      start_line: 5,
      end_line: 5,
      category: 'style',
      severity: 'low',
    },
  ],
};

describe('ReviewTaskService.persistResult', () => {
  beforeEach(() => jest.clearAllMocks());

  it('评论全部入库 + severity 聚合正确 + 默认 OPEN/isNew', async () => {
    const { service, createdFindings } = createService();
    const r = await service.persistResult('t1', 'repo1', baseResult, []);

    expect(r.comments).toBe(2);
    expect(r.severityCount).toEqual({ critical: 1, low: 1 });
    expect(createdFindings).toHaveLength(2);
    const c0 = createdFindings[0] as Record<string, unknown>;
    expect(c0.status).toBe('OPEN');
    expect(c0.isNew).toBe(true);
    expect(c0.fingerprint).toHaveLength(64);
    expect(c0.firstSeenTaskId).toBe('t1');
    expect(c0.lastSeenTaskId).toBe('t1');
  });

  it('指纹命中历史 → isNew=false 且继承 firstSeenTaskId', async () => {
    const { service, prisma, createdFindings } = createService();
    // 第一次入库算出指纹
    await service.persistResult('t1', 'repo1', baseResult, []);
    const fp0 = (createdFindings[0] as Record<string, unknown>).fingerprint as string;

    // 第二次：历史查询返回该指纹
    prisma.reviewFinding.findMany.mockResolvedValue([{ fingerprint: fp0, firstSeenTaskId: 't1' }]);
    const r = await service.persistResult('t2', 'repo1', baseResult, []);
    const c0 = createdFindings[2] as Record<string, unknown>; // 第 2 批第 1 条
    expect(r.comments).toBe(2);
    expect(c0.isNew).toBe(false);
    expect(c0.firstSeenTaskId).toBe('t1'); // 继承首次发现
    expect(c0.lastSeenTaskId).toBe('t2');
  });

  it('severity/category 缺省降级为 medium/other', async () => {
    const { service, createdFindings } = createService();
    const result: OcrResultJson = {
      status: 'success',
      comments: [{ path: 'x.ts', content: 'c', start_line: 1, end_line: 1 }],
    };
    await service.persistResult('t1', 'repo1', result, []);
    const c = createdFindings[0] as Record<string, unknown>;
    expect(c.severity).toBe('medium');
    expect(c.category).toBe('other');
  });

  it('traceBuffer 批量入库（含 raw 偏移）', async () => {
    const { service, txMock } = createService();
    await service.persistResult('t1', 'repo1', baseResult, [
      {
        seq: 1,
        taskType: 'MAIN_TASK',
        filePath: 'src/a.ts',
        model: 'm',
        durationMs: 100,
        rawPath: '/raw/f.jsonl',
        rawOffset: 0,
        rawLen: 100,
      },
      {
        seq: 2,
        taskType: 'MAIN_TASK',
        filePath: 'src/b.ts',
        model: 'm',
        durationMs: 200,
        rawPath: '/raw/f.jsonl',
        rawOffset: 100,
        rawLen: 120,
      },
    ]);
    expect(txMock.reviewTraceCall.createMany).toHaveBeenCalledTimes(1);
    const calls = (
      txMock.reviewTraceCall.createMany.mock.calls[0] as [{ data: Array<Record<string, unknown>> }]
    )[0].data;
    expect(calls).toHaveLength(2);
    expect(calls[0].rawOffset).toBe(0);
    expect(calls[1].rawLen).toBe(120);
  });
});

describe('ReviewTaskService.cancel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('终态任务不可取消（REVIEW_TASK_NOT_CANCELLABLE）', async () => {
    const { service, prisma, queue, executor } = createService();
    prisma.reviewTask.findFirst.mockResolvedValue({ id: 't1', status: 'SUCCESS' });
    await expect(service.cancel('t1')).rejects.toMatchObject({ bizCode: 12004 });
    expect(queue.removePending).not.toHaveBeenCalled();
    expect(executor.cancel).not.toHaveBeenCalled();
  });

  it('队列中未启动 → 移除 job 并标记 CANCELLED', async () => {
    const { service, prisma, queue, executor } = createService();
    prisma.reviewTask.findFirst.mockResolvedValue({ id: 't1', status: 'PENDING' });
    queue.removePending.mockResolvedValue(true);
    await service.cancel('t1');
    expect(executor.cancel).not.toHaveBeenCalled();
    expect(prisma.reviewTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1', status: { notIn: ['SUCCESS', 'FAILED', 'CANCELLED'] } },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });

  it('执行中 → kill 子进程并标记', async () => {
    const { service, prisma, queue, executor } = createService();
    prisma.reviewTask.findFirst.mockResolvedValue({ id: 't1', status: 'RUNNING' });
    queue.removePending.mockResolvedValue(false);
    await service.cancel('t1');
    expect(executor.cancel).toHaveBeenCalledWith('t1');
    expect(prisma.reviewTask.updateMany).toHaveBeenCalled();
  });
});
