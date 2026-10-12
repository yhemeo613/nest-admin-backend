import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisService } from '@/infra/redis/redis.service';
import { Public } from '@/shared/decorators/public.decorator';

@ApiTags('健康检查')
@Controller()
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 存活探针：进程在即 OK */
  @Get('health')
  @ApiOperation({ summary: '存活探针' })
  liveness() {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  /** 就绪探针：依赖（DB/Redis）可达才就绪 */
  @Get('ready')
  @ApiOperation({ summary: '就绪探针（含 DB/Redis 探测）' })
  async readiness() {
    const checks: Record<string, 'ok' | 'fail'> = { database: 'ok', redis: 'ok' };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      checks.database = 'fail';
    }
    try {
      await this.redis.client.ping();
    } catch {
      checks.redis = 'fail';
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    return { status: ok ? 'ok' : 'degraded', checks };
  }
}
