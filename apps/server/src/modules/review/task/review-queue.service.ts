import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

/** BullMQ 连接：由 redis.url 解析（redis://[:password@]host:port/db） */
export function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
  tls?: Record<string, never>;
} {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.pathname && u.pathname !== '/' ? { db: Number(u.pathname.slice(1)) || 0 } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export const REVIEW_QUEUE_NAME = 'review';

/**
 * 评审任务队列（BullMQ，Redis 持久化）。
 * Worker 在 ReviewWorkerService 中注册；jobId = taskId，天然幂等。
 */
@Injectable()
export class ReviewQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ReviewQueueService.name);
  readonly queue: Queue;

  constructor(config: ConfigService) {
    const connection = parseRedisUrl(config.get<string>('redis.url', 'redis://localhost:6379'));
    this.queue = new Queue(REVIEW_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 500, // 保留最近 500 条供排查
        removeOnFail: 1000,
        attempts: 1, // OCR 任务不做自动重试（重跑走 rerun）
      },
    });
  }

  async enqueue(taskId: string): Promise<void> {
    await this.queue.add('run', { taskId }, { jobId: taskId });
    this.logger.log(`任务入队: ${taskId}`);
  }

  /** 任务尚在队列（未开始执行）时移除；已运行返回 false（需走进程取消） */
  async removePending(taskId: string): Promise<boolean> {
    const job = await this.queue.getJob(taskId);
    if (!job) return false;
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'prioritized') {
      await job.remove();
      return true;
    }
    return false;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
