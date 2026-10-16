import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma, ReviewNotif, ReviewNotifType } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisService } from '@/infra/redis/redis.service';
import { ReviewEvent } from '@/shared/constants/event';

/** 通知 SSE 频道（用户级；'all' 为全员广播） */
export function notifChannel(userId: string): string {
  return `review:notif:${userId}`;
}

export interface NotifPayload {
  id: string;
  type: string;
  taskId: string | null;
  title: string;
  content: string | null;
  createdAt: Date;
}

/** 评审站内通知：消费任务事件 → 落库 + Redis 广播（SSE 转发） */
@Injectable()
export class ReviewNotifService {
  private readonly logger = new Logger(ReviewNotifService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @OnEvent(ReviewEvent.taskFinished)
  async onTaskFinished(payload: {
    taskId: string;
    gateStatus?: string;
    createdBy?: string;
  }): Promise<void> {
    const task = await this.loadTask(payload.taskId);
    if (!task) return;
    const gate =
      payload.gateStatus === 'FAIL'
        ? '（红线未通过）'
        : payload.gateStatus === 'PASS'
          ? '（红线通过）'
          : '';
    await this.push(
      'TASK_FINISHED',
      payload.taskId,
      `评审完成：${task.repo.name}`,
      `任务 ${taskIdShort(payload.taskId)} 评审完成${gate}`,
      payload.createdBy,
    );
  }

  @OnEvent(ReviewEvent.taskFailed)
  async onTaskFailed(payload: {
    taskId: string;
    error?: string;
    createdBy?: string;
  }): Promise<void> {
    const task = await this.loadTask(payload.taskId);
    if (!task) return;
    await this.push(
      'TASK_FAILED',
      payload.taskId,
      `评审失败：${task.repo.name}`,
      (payload.error ?? '未知错误').slice(0, 300),
      payload.createdBy,
    );
  }

  @OnEvent(ReviewEvent.gateFailed)
  async onGateFailed(payload: {
    taskId: string;
    gateDetail?: { reasons?: string[] };
    createdBy?: string;
  }): Promise<void> {
    const reasons = payload.gateDetail?.reasons?.join('；') ?? '';
    await this.push('GATE_FAILED', payload.taskId, '质量红线未通过', reasons, payload.createdBy);
  }

  /** 列表（登录用户：自己的 + 全员广播） */
  async list(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ list: ReviewNotif[]; total: number }> {
    const where: Prisma.ReviewNotifWhereInput = { OR: [{ userId }, { userId: null }] };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.reviewNotif.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.reviewNotif.count({ where }),
    ]);
    return { list, total };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.reviewNotif.count({
      where: { isRead: false, OR: [{ userId }, { userId: null }] },
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.reviewNotif.updateMany({
      where: { id, OR: [{ userId }, { userId: null }] },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.reviewNotif.updateMany({
      where: { isRead: false, OR: [{ userId }, { userId: null }] },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * 订阅通知（SSE 用）：订阅个人频道 + 全员频道，返回消息迭代器与释放函数。
   */
  subscribe(userId: string): {
    iterator: AsyncIterableIterator<string>;
    close: () => Promise<void>;
  } {
    const channels = [notifChannel('all'), notifChannel(userId)];
    const queue: string[] = [];
    const waiters: Array<(r: IteratorResult<string>) => void> = [];
    let closed = false;
    const subs = channels.map((ch) => {
      const sub = this.redis.client.duplicate({ lazyConnect: true });
      sub.on('message', (_c: string, raw: string) => {
        const waiter = waiters.shift();
        if (waiter) waiter({ value: raw, done: false });
        else queue.push(raw);
      });
      void sub.subscribe(ch).catch(() => undefined);
      return sub;
    });

    const close = async () => {
      if (closed) return;
      closed = true;
      for (const s of subs) {
        await s.unsubscribe().catch(() => undefined);
        await s.quit().catch(() => undefined);
      }
      while (waiters.length) waiters.shift()!({ value: '', done: true });
    };

    const iterator: AsyncIterableIterator<string> = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        if (queue.length) return Promise.resolve({ value: queue.shift()!, done: false });
        if (closed) return Promise.resolve({ value: '', done: true });
        return new Promise<IteratorResult<string>>((resolve) => waiters.push(resolve));
      },
    };

    return { iterator, close };
  }

  /** 落库 + 广播（userId 空 = 全员频道） */
  private async push(
    type: ReviewNotifType,
    taskId: string | null,
    title: string,
    content: string | null,
    userId?: string,
  ): Promise<void> {
    const notif = await this.prisma.reviewNotif.create({
      data: { userId: userId ?? null, type, taskId, title, content },
    });
    const payload: NotifPayload = {
      id: notif.id,
      type: notif.type,
      taskId: notif.taskId,
      title: notif.title,
      content: notif.content,
      createdAt: notif.createdAt,
    };
    const raw = JSON.stringify(payload);
    try {
      // 个人频道 + 全员频道都发（铃铛订阅全员频道；个人频道预留给私信式通知）
      await this.redis.client.publish(notifChannel(userId ?? 'all'), raw);
      if (userId) await this.redis.client.publish(notifChannel('all'), raw);
    } catch (e) {
      this.logger.warn(`通知广播失败: ${(e as Error).message}`);
    }
  }

  private async loadTask(taskId: string) {
    return this.prisma.reviewTask.findFirst({
      where: { id: taskId },
      include: { repo: { select: { name: true } } },
    });
  }
}

function taskIdShort(id: string): string {
  return id.slice(0, 8);
}
