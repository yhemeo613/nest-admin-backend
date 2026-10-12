import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { AiEvent } from '@/shared/constants/event';

import {
  NOTIFICATION_TYPES,
  NotificationListResponseDto,
  NotificationTypeValue,
} from './dto/notification.dto';

const LIST_TAKE = 50;

/**
 * 站内通知：按用户隔离，读状态服务端持久化。
 * 生产方：系统事件（如 AI 调用失败）与 seed 样本；消费方：顶部铃铛/通知面板。
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** AI 调用失败事件 → 给发起用户生成一条系统通知 */
  @OnEvent(AiEvent.callFailed)
  async onAiCallFailed(payload: {
    userId: string;
    model: string;
    errorMsg: string;
  }): Promise<void> {
    try {
      await this.notify(
        payload.userId,
        'NOTICE',
        `AI 调用失败（${payload.model || '未知模型'}）`,
        payload.errorMsg.slice(0, 200),
        '/ai/chat',
      );
    } catch (err) {
      this.logger.warn(`生成 AI 失败通知失败: ${err instanceof Error ? err.message : err}`);
    }
  }

  async list(userId: string): Promise<NotificationListResponseDto> {
    const [rows, unreadGroups] = await Promise.all([
      this.prisma.sysNotification.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: LIST_TAKE,
      }),
      this.prisma.sysNotification.groupBy({
        by: ['type'],
        where: { userId, deletedAt: null, readAt: null },
        _count: { _all: true },
      }),
    ]);

    const counts = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, 0])) as Record<
      NotificationTypeValue,
      number
    >;
    let totalUnread = 0;
    for (const group of unreadGroups) {
      if (group.type in counts) {
        counts[group.type as NotificationTypeValue] = group._count._all;
        totalUnread += group._count._all;
      }
    }

    return {
      list: rows.map((row) => ({
        id: row.id,
        type: row.type as NotificationTypeValue,
        title: row.title,
        content: row.content,
        link: row.link,
        read: row.readAt !== null,
        createdAt: row.createdAt.toISOString(),
      })),
      counts,
      totalUnread,
    };
  }

  /** 单条已读（带 userId 归属校验，天然越权安全） */
  async markRead(userId: string, id: string): Promise<null> {
    await this.prisma.sysNotification.updateMany({
      where: { id, userId, deletedAt: null, readAt: null },
      data: { readAt: new Date() },
    });
    return null;
  }

  /** 全部已读（可限定类型） */
  async markAllRead(userId: string, type?: NotificationTypeValue): Promise<{ affected: number }> {
    const result = await this.prisma.sysNotification.updateMany({
      where: { userId, deletedAt: null, readAt: null, ...(type ? { type } : {}) },
      data: { readAt: new Date() },
    });
    return { affected: result.count };
  }

  /** 清空已读（软删除，可限定类型） */
  async clearRead(userId: string, type?: NotificationTypeValue): Promise<{ affected: number }> {
    const result = await this.prisma.sysNotification.updateMany({
      where: { userId, deletedAt: null, readAt: { not: null }, ...(type ? { type } : {}) },
      data: { deletedAt: new Date() },
    });
    return { affected: result.count };
  }

  /** 系统事件生产入口（内部使用，不对外开放 REST） */
  async notify(
    userId: string,
    type: NotificationTypeValue,
    title: string,
    content?: string,
    link?: string,
  ): Promise<void> {
    await this.prisma.sysNotification.create({
      data: { userId, type, title, content: content ?? null, link: link ?? null },
    });
  }
}
