import * as z from 'zod';

import { AuthUser } from '@/shared/types/auth-user';

import { AiRegistry, ResolvedModel } from './ai.registry';
import { AgentToolSpec, executeToolSafely, RunAgentParams } from './ai-agent.service';
import { AiAgentService } from './ai-agent.service';
import { AiUsageService } from './ai-usage.service';
import { MockChatModel } from './models/mock-chat.model';

const auth: AuthUser = {
  userId: 'u1',
  username: 'admin',
  nickname: '管理员',
  isSuper: false,
  deptId: null,
};

function spec(overrides: Partial<AgentToolSpec>): AgentToolSpec {
  return {
    name: 'demo_tool',
    description: '演示工具',
    schema: z.object({}),
    run: jest.fn().mockResolvedValue({ ok: 1 }),
    ...overrides,
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const frames: T[] = [];
  for await (const frame of iterable) frames.push(frame);
  return frames;
}

function agentService(): AiAgentService {
  const registry = {
    resolve: jest.fn().mockResolvedValue(null),
    envDefault: jest.fn().mockReturnValue({
      model: new MockChatModel('mock-chat'),
      modelName: 'mock-chat',
      providerName: 'mock',
    } satisfies ResolvedModel),
  } as unknown as AiRegistry;
  const usage = { log: jest.fn(), summary: jest.fn() } as unknown as AiUsageService;
  return new AiAgentService(registry, usage);
}

function params(tools: AgentToolSpec[]): RunAgentParams {
  return {
    userId: 'u1',
    systemPrompt: '你是助手',
    history: [],
    message: '你好',
    toolContext: { user: auth, perms: new Set<string>() },
    tools,
  };
}

describe('executeToolSafely（工具权限折叠）', () => {
  it('权限不足：折叠为 {error}，不抛出', async () => {
    const run = jest.fn();
    const out = await executeToolSafely(
      spec({ permission: 'system:user:list' as never, run }),
      {},
      {
        user: auth,
        perms: new Set(),
      },
    );
    expect(JSON.parse(out).error).toContain('权限不足');
    expect(run).not.toHaveBeenCalled();
  });

  it('超管旁路权限检查', async () => {
    const out = await executeToolSafely(
      spec({ permission: 'system:user:list' as never }),
      {},
      { user: { ...auth, isSuper: true }, perms: new Set() },
    );
    expect(JSON.parse(out)).toEqual({ ok: 1 });
  });

  it('执行异常：折叠为 {error}，不抛出', async () => {
    const out = await executeToolSafely(
      spec({
        run: jest.fn().mockRejectedValue(new Error('数据库繁忙')),
      }),
      {},
      { user: { ...auth, isSuper: true }, perms: new Set() },
    );
    expect(JSON.parse(out).error).toBe('数据库繁忙');
  });

  it('成功返回：对象序列化为 JSON', async () => {
    const out = await executeToolSafely(
      spec({ run: jest.fn().mockResolvedValue({ users: 3 }) }),
      {},
      {
        user: { ...auth, isSuper: true },
        perms: new Set(),
      },
    );
    expect(JSON.parse(out)).toEqual({ users: 3 });
  });
});

describe('AiAgentService（LangChain createAgent 编排）', () => {
  it('无工具调用场景：产出 text 分片与 end 帧（usage/model）', async () => {
    const frames = await collect(agentService().runAgent(params([])));

    const text = frames
      .filter((f) => f.type === 'text')
      .map((f) => f.delta)
      .join('');
    expect(text).toContain('已收到你的消息');
    const last = frames[frames.length - 1];
    expect(last).toMatchObject({ type: 'end', model: 'mock-chat' });
  });

  it('空消息场景下工具规格原样透传（schema 可被 LangChain 消费）', async () => {
    // MockChatModel 不发起工具调用，这里验证工具装配阶段不报错即为通过
    const frames = await collect(agentService().runAgent(params([spec({})])));
    expect(frames.some((f) => f.type === 'end')).toBe(true);
  });
});
