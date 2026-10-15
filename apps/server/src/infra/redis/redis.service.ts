import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>('redis.url', 'redis://localhost:6379'), {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** ttlSeconds 缺省为永不过期 */
  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, raw, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, raw);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  /** 按模式删除（scan + pipeline，避免 KEYS 阻塞） */
  async delByPattern(pattern: string): Promise<number> {
    const stream = this.client.scanStream({ match: pattern, count: 200 });
    let removed = 0;
    for await (const keys of stream) {
      if ((keys as string[]).length === 0) continue;
      const pipeline = this.client.pipeline();
      for (const key of keys as string[]) pipeline.del(key);
      await pipeline.exec();
      removed += (keys as string[]).length;
    }
    return removed;
  }
}
