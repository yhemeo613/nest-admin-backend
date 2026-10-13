import { ErrorCode } from '@/shared/constants/error-code';

import { hashApiKey } from './api-key.util';
import { VisitorChatDto } from './dto/visitor-chat.dto';
import { VisitorChatService } from './visitor-chat.service';

const PLAIN_KEY = 'sk-0123456789abcdef';

function createPrismaStub() {
  return {
    tenantApiKey: { findFirst: jest.fn(), update: jest.fn() },
    tenantConversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    tenantMessage: { findMany: jest.fn(), create: jest.fn() },
    saasKb: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
}

function createKbSearchStub() {
  return { search: jest.fn().mockResolvedValue([]) };
}

function createGatewayStub(streamFrames: { delta: string; done: boolean }[]) {
  return {
    chatStream: jest.fn(async function* () {
      for (const frame of streamFrames) yield frame;
    }),
  };
}

const dto: VisitorChatDto = { visitorId: 'v-1', message: '你们的退货政策？' };

async function collect(iterable: AsyncIterable<unknown>) {
  const frames = [];
  for await (const frame of iterable) frames.push(frame);
  return frames;
}

describe('VisitorChatService（访客对话：ApiKey 鉴权 + 会话落库）', () => {
  let prisma: ReturnType<typeof createPrismaStub>;

  beforeEach(() => {
    prisma = createPrismaStub();
    prisma.$transaction.mockResolvedValue([]);
  });

  it('无效 Key 抛 API_KEY_INVALID', async () => {
    prisma.tenantApiKey.findFirst.mockResolvedValue(null);
    const service = new VisitorChatService(
      prisma as never,
      createGatewayStub([]) as never,
      createKbSearchStub() as never,
    );

    await expect(collect(service.stream(PLAIN_KEY, dto))).rejects.toMatchObject({
      bizCode: ErrorCode.API_KEY_INVALID,
    });
  });

  it('租户被禁用时拒绝访问', async () => {
    prisma.tenantApiKey.findFirst.mockResolvedValue({
      id: 'k1',
      tenantId: 't1',
      status: 'ENABLED',
      tenant: { id: 't1', name: '演示', status: 'DISABLED', deletedAt: null },
    });
    const service = new VisitorChatService(
      prisma as never,
      createGatewayStub([]) as never,
      createKbSearchStub() as never,
    );

    await expect(collect(service.stream(PLAIN_KEY, dto))).rejects.toMatchObject({
      bizCode: ErrorCode.API_KEY_INVALID,
    });
  });

  it('按 Key 哈希查找，续聊会话必须属于同一租户', async () => {
    prisma.tenantApiKey.findFirst.mockResolvedValue({
      id: 'k1',
      tenantId: 't1',
      status: 'ENABLED',
      tenant: { id: 't1', name: '演示', status: 'ENABLED', deletedAt: null },
    });
    prisma.tenantConversation.findFirst.mockResolvedValue(null);
    const service = new VisitorChatService(
      prisma as never,
      createGatewayStub([]) as never,
      createKbSearchStub() as never,
    );

    await expect(
      collect(service.stream(PLAIN_KEY, { ...dto, conversationId: 'c-other' })),
    ).rejects.toMatchObject({ bizCode: ErrorCode.CONVERSATION_NOT_FOUND });
    expect(prisma.tenantApiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ keyHash: hashApiKey(PLAIN_KEY) }),
      }),
    );
  });

  it('新会话：首帧回传 conversationId，用户/助手消息均落库', async () => {
    prisma.tenantApiKey.findFirst.mockResolvedValue({
      id: 'k1',
      tenantId: 't1',
      status: 'ENABLED',
      tenant: { id: 't1', name: '演示', status: 'ENABLED', deletedAt: null },
    });
    prisma.tenantConversation.create.mockResolvedValue({ id: 'c1' });
    prisma.tenantMessage.findMany.mockResolvedValue([]);
    const gateway = createGatewayStub([
      { delta: '七天', done: false },
      { delta: '无理由', done: false },
      { delta: '', done: true },
    ]);
    const service = new VisitorChatService(
      prisma as never,
      gateway as never,
      createKbSearchStub() as never,
    );

    const frames = await collect(service.stream(PLAIN_KEY, dto));

    expect(frames[0]).toMatchObject({ conversationId: 'c1', done: false });
    expect(frames[frames.length - 1]).toMatchObject({ conversationId: 'c1', done: true });
    // 用户消息 + 助手消息各一条
    expect(prisma.tenantMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'user' }) }),
    );
    expect(prisma.tenantMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'assistant', content: '七天无理由' }),
      }),
    );
    // 会话计数 +2（用户 + 助手），且更新了 updatedAt
    expect(prisma.tenantConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ messageCount: { increment: 2 } }),
      }),
    );
  });

  it('历史消息按时间倒序取后反转，拼入模型上下文', async () => {
    prisma.tenantApiKey.findFirst.mockResolvedValue({
      id: 'k1',
      tenantId: 't1',
      status: 'ENABLED',
      tenant: { id: 't1', name: '演示', status: 'ENABLED', deletedAt: null },
    });
    prisma.tenantConversation.findFirst.mockResolvedValue({ id: 'c1', tenantId: 't1' });
    prisma.tenantMessage.findMany.mockResolvedValue([
      { role: 'assistant', content: '你好' },
      { role: 'user', content: '在吗' },
    ]);
    const gateway = createGatewayStub([{ delta: '', done: true }]);
    const service = new VisitorChatService(
      prisma as never,
      gateway as never,
      createKbSearchStub() as never,
    );

    await collect(service.stream(PLAIN_KEY, { ...dto, conversationId: 'c1' }));

    const call = gateway.chatStream.mock.calls[0] as unknown as [
      string,
      { messages: { role: string; content: string }[] },
    ];
    const messages = call[1].messages;
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(messages[0].content).toContain('演示');
  });
});
