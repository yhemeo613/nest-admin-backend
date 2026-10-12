import { ConfigService } from '@nestjs/config';

import { BusinessException } from '@/shared/exceptions/business.exception';

import { AiService } from './ai.service';
import {
  ChatDelta,
  ChatParams,
  ChatResult,
  ILlmProvider,
} from './providers/llm-provider.interface';

class StubProvider implements ILlmProvider {
  readonly name = 'stub';
  readonly defaultModel = 'stub-model';
  chatImpl: (params: ChatParams) => Promise<ChatResult> = () => {
    throw new Error('not implemented');
  };
  streamImpl: (params: ChatParams) => AsyncIterable<ChatDelta> = () => {
    throw new Error('not implemented');
  };

  chat(params: ChatParams): Promise<ChatResult> {
    return this.chatImpl(params);
  }
  chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
    return this.streamImpl(params);
  }
  embed(): Promise<number[][]> {
    return Promise.resolve([[0.1, 0.2]]);
  }
}

const stubConfig = (fallbackModel: string) =>
  ({
    get: (key: string, defaultValue?: unknown) => {
      if (key === 'ai.fallbackModel') return fallbackModel;
      if (key === 'ai.maxTokens') return 2048;
      return defaultValue;
    },
  }) as ConfigService;

describe('AiService（AI 门面：降级与审计）', () => {
  let provider: StubProvider;
  let usage: { log: jest.Mock };

  const params: ChatParams = { messages: [{ role: 'user', content: '你好' }] };

  beforeEach(() => {
    provider = new StubProvider();
    usage = { log: jest.fn() };
  });

  it('主模型成功：直接返回并记录 success 审计', async () => {
    const service = new AiService(provider, usage as never, stubConfig('backup-model'));
    provider.chatImpl = async () => ({
      content: 'ok',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: 'stop',
      model: 'main-model',
    });

    const result = await service.chat('u1', params);

    expect(result.content).toBe('ok');
    expect(usage.log).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('主模型失败且有备用模型：自动降级并记录 fallback 审计', async () => {
    const service = new AiService(provider, usage as never, stubConfig('backup-model'));
    provider.chatImpl = async (p) => {
      if (p.model !== 'backup-model') throw new Error('主模型超时');
      return { content: 'fallback-ok', usage: null, finishReason: 'stop', model: 'backup-model' };
    };

    const result = await service.chat('u1', params);

    expect(result.content).toBe('fallback-ok');
    expect(usage.log).toHaveBeenCalledWith(expect.objectContaining({ status: 'fallback' }));
  });

  it('主备模型均失败：抛出业务异常并记录 error 审计', async () => {
    const service = new AiService(provider, usage as never, stubConfig('backup-model'));
    provider.chatImpl = async () => {
      throw new Error('boom');
    };

    await expect(service.chat('u1', params)).rejects.toBeInstanceOf(BusinessException);
    expect(usage.log).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  it('流式：已产出内容后失败不可降级，直接抛错', async () => {
    const service = new AiService(provider, usage as never, stubConfig('backup-model'));
    provider.streamImpl = async function* () {
      yield { delta: '部分', done: false };
      throw new Error('流中断');
    };

    const consume = async () => {
      for await (const _ of service.chatStream('u1', params)) {
        // 消费到错误发生
      }
    };
    await expect(consume()).rejects.toBeInstanceOf(BusinessException);
  });
});
