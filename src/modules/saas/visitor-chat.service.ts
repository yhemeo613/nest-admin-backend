import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Status } from '@prisma/client';

import { AiGateway, AiStreamDelta, AiTokenUsage } from '@/infra/ai/ai-gateway.service';
import { loadPrompt } from '@/infra/ai/prompt.loader';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { hashApiKey } from './api-key.util';
import { VisitorChatDto } from './dto/visitor-chat.dto';
import { KbSearchHit, KbSearchService } from './kb-search.service';

/** 多轮上下文窗口：从会话历史取最近 N 条 */
const HISTORY_WINDOW = 20;

/** 访客对话帧：在标准流式分片上回传会话 ID，便于挂件续聊 */
export interface VisitorFrame extends AiStreamDelta {
  conversationId?: string;
}

interface VisitorAuth {
  apiKeyId: string;
  tenantId: string;
  tenantName: string;
  tenantCode: string;
}

/**
 * 访客对话（公开接口，X-Api-Key 鉴权）：
 * ApiKey → 租户 → 会话/消息落库 → 平台默认模型流式回答（经 AiGateway，LangChain 架构）。
 * 与管理端 /ai/chat 分离：访客侧无工具调用、无管理权限上下文。
 */
@Injectable()
export class VisitorChatService {
  private readonly logger = new Logger(VisitorChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGateway,
    private readonly kbSearch: KbSearchService,
  ) {}

  async *stream(
    plainKey: string,
    dto: VisitorChatDto,
    signal?: AbortSignal,
  ): AsyncIterable<VisitorFrame> {
    const auth = await this.resolveApiKey(plainKey);
    const conversation = await this.ensureConversation(auth, dto);

    // 先取历史（不含本条用户消息），再落库用户消息
    const history = await this.prisma.tenantMessage.findMany({
      where: { conversationId: conversation.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_WINDOW,
    });
    await this.prisma.tenantMessage.create({
      data: {
        tenantId: auth.tenantId,
        conversationId: conversation.id,
        role: 'user',
        content: dto.message,
      },
    });

    // 知识增强：命中文章以「参考资料」注入（P1 关键词检索，P2 升级向量）
    const kbId = dto.kbId ?? (await this.defaultKbId(auth.tenantId));
    const hits = kbId
      ? await this.kbSearch
          .search(dto.message, { tenantId: auth.tenantId, kbId, limit: 3, previewLength: 1200 })
          .catch(() => [] as KbSearchHit[])
      : [];

    const messages = [
      { role: 'system' as const, content: this.buildSystemPrompt(auth.tenantName, hits) },
      ...history
        .reverse()
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: dto.message },
    ];

    // 首帧回传会话 ID：新建会话时挂件靠它续聊
    yield { conversationId: conversation.id, delta: '', done: false };

    let content = '';
    let usage: AiTokenUsage | null = null;
    let model = '';
    try {
      for await (const delta of this.gateway.chatStream(
        `visitor:${dto.visitorId}`,
        {
          messages,
          ...(dto.modelId ? { modelId: dto.modelId } : {}),
          ...(dto.temperature !== undefined ? { temperature: dto.temperature } : {}),
        },
        signal,
      )) {
        if (delta.done) {
          usage = delta.usage ?? null;
          model = delta.model ?? model;
        } else if (delta.delta) {
          content += delta.delta;
          yield { ...delta, conversationId: conversation.id };
        }
      }
    } finally {
      // 中途断连/报错也保留已产出的部分回答，便于运营排查
      await this.persistAssistant(conversation.id, auth.tenantId, content, model, usage);
      await this.touchApiKey(auth.apiKeyId);
    }

    yield { conversationId: conversation.id, delta: '', done: true, usage, model };
  }

  /** X-Api-Key → 租户上下文；Key 与租户任一失效即拒绝 */
  async resolveApiKey(plainKey: string): Promise<VisitorAuth> {
    if (!plainKey) throw new BusinessException(ErrorCode.API_KEY_INVALID, '缺少 X-Api-Key 头');
    const key = await this.prisma.tenantApiKey.findFirst({
      where: { keyHash: hashApiKey(plainKey), deletedAt: null },
      include: { tenant: true },
    });
    if (!key || key.status !== 'ENABLED') {
      throw new BusinessException(ErrorCode.API_KEY_INVALID);
    }
    if (key.tenant.deletedAt || key.tenant.status !== 'ENABLED') {
      throw new BusinessException(ErrorCode.API_KEY_INVALID, '所属租户已停用');
    }
    return {
      apiKeyId: key.id,
      tenantId: key.tenantId,
      tenantName: key.tenant.name,
      tenantCode: key.tenant.code,
    };
  }

  private async ensureConversation(auth: VisitorAuth, dto: VisitorChatDto) {
    if (dto.conversationId) {
      const existing = await this.prisma.tenantConversation.findFirst({
        where: { id: dto.conversationId, tenantId: auth.tenantId, deletedAt: null },
      });
      if (!existing) throw new BusinessException(ErrorCode.CONVERSATION_NOT_FOUND);
      return existing;
    }
    return this.prisma.tenantConversation.create({
      data: {
        tenantId: auth.tenantId,
        visitorId: dto.visitorId,
        title: dto.message.slice(0, 50),
      },
    });
  }

  private async persistAssistant(
    conversationId: string,
    tenantId: string,
    content: string,
    model: string,
    usage: AiTokenUsage | null,
  ): Promise<void> {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (content) {
      ops.push(
        this.prisma.tenantMessage.create({
          data: {
            tenantId,
            conversationId,
            role: 'assistant',
            content,
            model: model || null,
            promptTokens: usage?.promptTokens ?? 0,
            completionTokens: usage?.completionTokens ?? 0,
          },
        }),
      );
    }
    ops.push(
      this.prisma.tenantConversation.update({
        where: { id: conversationId },
        data: {
          messageCount: { increment: content ? 2 : 1 },
          updatedAt: new Date(),
        },
      }),
    );
    try {
      await this.prisma.$transaction(ops);
    } catch (error) {
      // 落库失败不影响已下发给访客的回答，只记录日志
      this.logger.error(
        `会话消息落库失败 conversation=${conversationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async touchApiKey(apiKeyId: string): Promise<void> {
    try {
      await this.prisma.tenantApiKey.update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date() },
      });
    } catch {
      // 使用时间戳失败不影响主流程
    }
  }

  /** 租户默认知识库：第一个启用的库（按 sort），无库返回 null（回落 v1 通用客服模板） */
  private async defaultKbId(tenantId: string): Promise<string | null> {
    const kb = await this.prisma.saasKb.findFirst({
      where: { tenantId, status: Status.ENABLED, deletedAt: null },
      orderBy: { sort: 'asc' },
      select: { id: true },
    });
    return kb?.id ?? null;
  }

  private buildSystemPrompt(tenantName: string, hits: KbSearchHit[]): string {
    const vars = { tenantName, date: new Date().toLocaleString('zh-CN') };
    if (!hits.length) return loadPrompt('customer-service.v1.md', vars);
    const sources = hits
      .map((hit, index) => `${index + 1}. 【${hit.title}】\n${hit.preview}`)
      .join('\n\n');
    return loadPrompt('customer-service.v2.md', { ...vars, sources });
  }
}
