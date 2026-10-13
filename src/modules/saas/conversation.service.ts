import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { PageResult, toPageResult, toSkipTake } from '@/shared/dto/pagination.dto';
import { BusinessException } from '@/shared/exceptions/business.exception';
import { AuthUser } from '@/shared/types/auth-user';

import {
  ConversationDetailView,
  ConversationView,
  MessageView,
  QueryConversationDto,
} from './dto/conversation.dto';
import { dataScopeOf } from './scope.util';

/**
 * 访客会话查询：
 * - 平台视角全量；租户管理员（dataScopeOf 非空）强制只看自己租户
 * - 列表带租户名与消息数；详情返回全部消息
 */
@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async page(query: QueryConversationDto, user: AuthUser): Promise<PageResult<ConversationView>> {
    const scope = dataScopeOf(user);
    const where = {
      deletedAt: null,
      tenantId: scope ?? query.tenantId ?? undefined,
      ...(query.visitorId && { visitorId: query.visitorId }),
      ...(query.status && { status: query.status }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.tenantConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        ...toSkipTake(query),
        include: { tenant: { select: { name: true } } },
      }),
      this.prisma.tenantConversation.count({ where }),
    ]);
    return toPageResult(
      rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenant.name,
        visitorId: row.visitorId,
        title: row.title,
        status: row.status,
        messageCount: row.messageCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      total,
      query,
    );
  }

  async detail(id: string, user: AuthUser): Promise<ConversationDetailView> {
    const scope = dataScopeOf(user);
    const row = await this.prisma.tenantConversation.findFirst({
      where: { id, deletedAt: null },
      include: {
        tenant: { select: { name: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // 越权访问按「不存在」处理，不泄漏其他租户会话
    if (!row || (scope && row.tenantId !== scope)) {
      throw new BusinessException(ErrorCode.CONVERSATION_NOT_FOUND);
    }
    const messages: MessageView[] = row.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      model: m.model,
      promptTokens: m.promptTokens,
      completionTokens: m.completionTokens,
      createdAt: m.createdAt,
    }));
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenant.name,
      visitorId: row.visitorId,
      title: row.title,
      status: row.status,
      messageCount: row.messageCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messages,
    };
  }
}
