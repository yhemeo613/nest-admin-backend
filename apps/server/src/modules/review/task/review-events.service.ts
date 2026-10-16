import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { RedisService } from '@/infra/redis/redis.service';
import { REVIEW_TASK_CHANNEL_PREFIX } from '@/shared/constants/event';

/** SSE 事件负载（worker publish → SSE controller 转发） */
export type ReviewTaskEvent =
  | { type: 'snapshot'; status: string; stage: string; progress: number }
  | { type: 'stage'; stage: string; progress: number; message?: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | {
      type: 'trace_call';
      call: {
        seq: number;
        requestNo?: number;
        taskType?: string;
        filePath?: string;
        model?: string;
        durationMs?: number;
        statusCode?: number;
        tokensIn?: number | null;
        tokensOut?: number | null;
      };
    }
  | {
      type: 'finished';
      status: string;
      gateStatus?: string | null;
      message?: string;
    };

export function reviewTaskChannel(taskId: string): string {
  return `${REVIEW_TASK_CHANNEL_PREFIX}${taskId}`;
}

/** 评审任务实时事件：Redis pub/sub（多实例/未来 worker 独立部署天然兼容） */
@Injectable()
export class ReviewEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(ReviewEventsService.name);

  constructor(private readonly redis: RedisService) {}

  async publish(taskId: string, event: ReviewTaskEvent): Promise<void> {
    try {
      await this.redis.client.publish(reviewTaskChannel(taskId), JSON.stringify(event));
    } catch (e) {
      this.logger.warn(`任务事件发布失败 ${taskId}: ${(e as Error).message}`);
    }
  }

  /**
   * 订阅任务事件：返回消息迭代器与释放函数。
   * ioredis 的 subscribe 连接不能复用普通命令连接，这里 duplicate 专用。
   */
  subscribe(taskId: string): {
    iterator: AsyncIterableIterator<string>;
    close: () => Promise<void>;
  } {
    const sub = this.redis.client.duplicate({ lazyConnect: true });
    const channel = reviewTaskChannel(taskId);
    const queue: string[] = [];
    const waiters: Array<(r: IteratorResult<string>) => void> = [];
    let closed = false;

    sub.on('message', (_ch: string, message: string) => {
      const waiter = waiters.shift();
      if (waiter) waiter({ value: message, done: false });
      else queue.push(message);
    });

    const close = async () => {
      if (closed) return;
      closed = true;
      try {
        await sub.unsubscribe(channel);
        await sub.quit();
      } catch {
        // 连接已断开
      }
      // 唤醒挂起的 next()，让迭代器结束
      while (waiters.length) waiters.shift()!({ value: '', done: true });
    };

    void sub.subscribe(channel).catch((e) => {
      this.logger.warn(`订阅任务频道失败 ${taskId}: ${(e as Error).message}`);
      void close();
    });

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

  async onModuleDestroy(): Promise<void> {
    // 订阅连接由各自订阅方释放
  }
}
