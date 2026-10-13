import { ConfigService } from '@nestjs/config';

import { AgentFrame } from '@/infra/ai/ai-agent.service';
import { AuthUser } from '@/shared/types/auth-user';

import { AiChatService } from './ai-chat.service';
import { ChatDto } from './dto/chat.dto';

const auth: AuthUser = {
  userId: 'u1',
  username: 'admin',
  nickname: '管理员',
  isSuper: true,
  deptId: null,
};

function agentStub(frames: AgentFrame[]) {
  return {
    runAgent: jest.fn(async function* () {
      for (const frame of frames) yield frame;
    }),
  };
}

function toolsStub() {
  return {
    buildContext: jest.fn().mockResolvedValue({ user: auth, perms: new Set<string>() }),
    toAgentSpecs: jest.fn().mockReturnValue([]),
  };
}

const configStub = {
  get: (key: string, def?: unknown) => (key === 'app.name' ? '权限中枢' : def),
} as ConfigService;

const dto: ChatDto = { message: '查一下用户数' };

async function collect(iterable: AsyncIterable<unknown>) {
  const frames = [];
  for await (const frame of iterable) frames.push(frame);
  return frames;
}

describe('AiChatService（Agent 帧 → SSE 帧映射）', () => {
  it('text/tool/end 帧映射为旧版 SSE 契约', async () => {
    const agent = agentStub([
      { type: 'text', delta: '你好' },
      { type: 'text', delta: '世界' },
      { type: 'tool', name: 'get_system_overview', status: 'running' },
      { type: 'tool', name: 'get_system_overview', status: 'done' },
      {
        type: 'end',
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        model: 'm1',
      },
    ]);
    const service = new AiChatService(agent as never, toolsStub() as never, configStub);

    const frames = await collect(service.chatStream(auth, dto));

    expect(frames).toEqual([
      { delta: '你好', done: false },
      { delta: '世界', done: false },
      { delta: '', done: false, tool: { name: 'get_system_overview', status: 'running' } },
      { delta: '', done: false, tool: { name: 'get_system_overview', status: 'done' } },
      {
        delta: '',
        done: true,
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        model: 'm1',
      },
    ]);
  });

  it('chat() 聚合流式帧为完整文本', async () => {
    const agent = agentStub([
      { type: 'text', delta: 'Nest' },
      { type: 'text', delta: 'JS' },
      { type: 'end', usage: null, model: 'm1' },
    ]);
    const service = new AiChatService(agent as never, toolsStub() as never, configStub);

    const result = await service.chat(auth, dto);

    expect(result.content).toBe('NestJS');
    expect(result.model).toBe('m1');
  });
});
