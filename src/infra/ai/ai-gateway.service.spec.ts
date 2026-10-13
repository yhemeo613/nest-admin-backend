import { BusinessException } from '@/shared/exceptions/business.exception';

import { AiRegistry, ResolvedModel } from './ai.registry';
import { AiGateway } from './ai-gateway.service';
import { AiUsageService } from './ai-usage.service';
import { MockChatModel } from './models/mock-chat.model';

function stubRegistry(opts: {
  primary: ResolvedModel;
  fallback?: ResolvedModel | null;
}): AiRegistry {
  return {
    resolve: jest.fn().mockResolvedValue(opts.primary),
    envDefault: jest.fn().mockReturnValue(opts.primary),
    envFallback: jest.fn().mockReturnValue(opts.fallback ?? null),
    embeddings: jest.fn(),
    invalidate: jest.fn(),
  } as unknown as AiRegistry;
}

function usageStub() {
  return { log: jest.fn(), summary: jest.fn() } as unknown as AiUsageService;
}

const route = (model = 'mock-chat'): ResolvedModel => ({
  model: new MockChatModel(model),
  modelName: model,
  providerName: 'mock',
});

const messages = [{ role: 'user' as const, content: '你好' }];

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const frames: T[] = [];
  for await (const frame of iterable) frames.push(frame);
  return frames;
}

describe('AiGateway（LangChain 门面：流式/降级/审计）', () => {
  it('流式对话：产出分片与结束帧（usage/model），并落一条 success 审计', async () => {
    const usage = usageStub();
    const gateway = new AiGateway(stubRegistry({ primary: route() }), usage);

    const frames = await collect(gateway.chatStream('u1', { messages }));

    const text = frames
      .filter((f) => !f.done)
      .map((f) => f.delta)
      .join('');
    expect(text).toContain('已收到你的消息');
    const last = frames[frames.length - 1] as { done: boolean; model: string };
    expect(last.done).toBe(true);
    expect(last.model).toBe('mock-chat');
    expect(usage.log).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('主模型失败且有备用模型：降级重试并记 fallback 审计', async () => {
    const usage = usageStub();
    const failing = {
      model: {
        stream: jest.fn().mockRejectedValue(new Error('主模型超时')),
      },
      modelName: 'main-model',
      providerName: 'stub',
    } as unknown as ResolvedModel;
    const gateway = new AiGateway(
      stubRegistry({ primary: failing, fallback: route('backup-model') }),
      usage,
    );

    const frames = await collect(gateway.chatStream('u1', { messages }));

    const last = frames[frames.length - 1] as { done: boolean; model: string };
    expect(last.model).toBe('backup-model');
    expect(usage.log).toHaveBeenCalledWith(expect.objectContaining({ status: 'fallback' }));
    // 降级场景不重复记主调用的 error 行
    expect(usage.log).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  it('主模型失败且无备用模型：抛 AI_CALL_FAILED', async () => {
    const failing = {
      model: { stream: jest.fn().mockRejectedValue(new Error('upstream down')) },
      modelName: 'main-model',
      providerName: 'stub',
    } as unknown as ResolvedModel;
    const gateway = new AiGateway(stubRegistry({ primary: failing }), usageStub());

    await expect(collect(gateway.chatStream('u1', { messages }))).rejects.toBeInstanceOf(
      BusinessException,
    );
  });
});
