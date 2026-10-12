import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { requestContext } from '@/shared/context/request-context';

import { estimateCost } from './ai.constants';

export interface AiCallLogEntry {
  userId?: string;
  provider: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  latencyMs: number;
  status: 'success' | 'error' | 'fallback';
  errorMsg?: string;
}

/** AI 调用审计：异步落库，不阻塞响应；traceId 与请求日志串联 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  log(entry: AiCallLogEntry): void {
    const usage = entry.usage;
    this.prisma.aiCallLog
      .create({
        data: {
          traceId: requestContext.traceId ?? null,
          userId: entry.userId ?? null,
          provider: entry.provider,
          model: entry.model,
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
          costEstimate: usage ? estimateCost(entry.model, usage) : null,
          latencyMs: entry.latencyMs,
          status: entry.status,
          errorMsg: entry.errorMsg ?? null,
        },
      })
      .catch((err: unknown) => {
        this.logger.warn(`AI 调用日志落库失败: ${err instanceof Error ? err.message : err}`);
      });
  }

  /** 用量汇总（管理端报表）：按厂商 + 模型分组 */
  async summary() {
    const grouped = await this.prisma.aiCallLog.groupBy({
      by: ['provider', 'model'],
      _count: { _all: true },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        costEstimate: true,
      },
      orderBy: { _sum: { totalTokens: 'desc' } },
    });
    return grouped.map((row) => ({
      provider: row.provider,
      model: row.model,
      calls: row._count._all,
      promptTokens: row._sum.promptTokens ?? 0,
      completionTokens: row._sum.completionTokens ?? 0,
      totalTokens: row._sum.totalTokens ?? 0,
      costEstimate: row._sum.costEstimate ?? null,
    }));
  }
}
