import { Injectable } from '@nestjs/common';
import { Prisma, ReviewTask } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';

export interface DashboardStats {
  // 顶部统计卡
  tasks30d: number;
  successRate30d: number; // 0-100
  openFindings: number;
  gatePassRate30d: number; // 0-100（SKIPPED 不计入分母）
  totalTokens30d: number;
  // 图表
  severityTrend: Array<{
    date: string;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }>;
  categoryDist: Array<{ category: string; count: number }>;
  dailyTokens: Array<{ date: string; tokens: number }>;
  // 最近任务
  recentTasks: Array<{
    id: string;
    repoName: string | null;
    status: string;
    gateStatus: string | null;
    comments: number;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
  }>;
}

/** 评审工作台报表（JS 侧聚合：任务/finding 量级小，无需 SQL 日期截断） */
@Injectable()
export class ReviewDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(scopeFilter: Record<string, unknown>): Promise<DashboardStats> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const taskWhere: Prisma.ReviewTaskWhereInput = {
      deletedAt: null,
      createdAt: { gte: since },
      ...(scopeFilter as Prisma.ReviewTaskWhereInput),
    };

    const [tasks, openFindings, findings30d] = await Promise.all([
      this.prisma.reviewTask.findMany({
        where: taskWhere,
        select: {
          id: true,
          status: true,
          gateStatus: true,
          stats: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
          repo: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      this.prisma.reviewFinding.count({
        where: { deletedAt: null, status: 'OPEN' },
      }),
      this.prisma.reviewFinding.findMany({
        where: { deletedAt: null, createdAt: { gte: since } },
        select: { createdAt: true, severity: true, category: true },
        take: 5000,
      }),
    ]);

    return this.aggregate(tasks, openFindings, findings30d);
  }

  private aggregate(
    tasks: Array<
      Pick<
        ReviewTask,
        'id' | 'status' | 'gateStatus' | 'createdAt' | 'startedAt' | 'finishedAt'
      > & {
        stats: Prisma.JsonValue;
        repo: { name: string } | null;
      }
    >,
    openFindings: number,
    findings30d: Array<{ createdAt: Date; severity: string; category: string }>,
  ): DashboardStats {
    const finished = tasks.filter((t) => t.status === 'SUCCESS' || t.status === 'FAILED');
    const gated = tasks.filter((t) => t.gateStatus === 'PASS' || t.gateStatus === 'FAIL');

    const severityTrend = new Map<
      string,
      { critical: number; high: number; medium: number; low: number }
    >();
    const categoryDist = new Map<string, number>();
    for (const f of findings30d) {
      const date = f.createdAt.toISOString().slice(0, 10);
      const row = severityTrend.get(date) ?? { critical: 0, high: 0, medium: 0, low: 0 };
      const sev = f.severity as keyof typeof row;
      if (sev in row) row[sev] += 1;
      severityTrend.set(date, row);
      categoryDist.set(f.category, (categoryDist.get(f.category) ?? 0) + 1);
    }

    const dailyTokens = new Map<string, number>();
    let totalTokens = 0;
    for (const t of tasks) {
      const tokens = (t.stats as { totalTokens?: number } | null)?.totalTokens ?? 0;
      totalTokens += tokens;
      const date = t.createdAt.toISOString().slice(0, 10);
      dailyTokens.set(date, (dailyTokens.get(date) ?? 0) + tokens);
    }

    return {
      tasks30d: tasks.length,
      successRate30d: finished.length
        ? Math.round((tasks.filter((t) => t.status === 'SUCCESS').length / finished.length) * 100)
        : 0,
      openFindings,
      gatePassRate30d: gated.length
        ? Math.round((gated.filter((t) => t.gateStatus === 'PASS').length / gated.length) * 100)
        : 0,
      totalTokens30d: totalTokens,
      severityTrend: [...severityTrend.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v })),
      categoryDist: [...categoryDist.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({ category, count })),
      dailyTokens: [...dailyTokens.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, tokens]) => ({ date, tokens })),
      recentTasks: tasks.slice(0, 10).map((t) => ({
        id: t.id,
        repoName: t.repo?.name ?? null,
        status: t.status,
        gateStatus: t.gateStatus,
        comments: (t.stats as { comments?: number } | null)?.comments ?? 0,
        startedAt: t.startedAt,
        finishedAt: t.finishedAt,
        createdAt: t.createdAt,
      })),
    };
  }
}
