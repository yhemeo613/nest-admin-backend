import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/infra/prisma/prisma.service';

import { AiTrendPointDto, DashboardStatsDto, RecentAiCallDto } from './dto/dashboard.dto';

/** 今天零点（本地时区），用于「今日」口径统计 */
const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

interface TrendRow {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
}

/**
 * 工作台聚合数据：系统资源计数 + AI 用量指标 + 趋势 + 最近调用。
 * 所有数字均来自真实表，不返回任何 mock。
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(): Promise<DashboardStatsDto> {
    const todayStart = startOfToday();

    const [
      users,
      roles,
      permissions,
      departments,
      providers,
      models,
      defaultModel,
      todayAgg,
      todayErrors,
      totalsAgg,
    ] = await Promise.all([
      this.prisma.sysUser.count({ where: { deletedAt: null } }),
      this.prisma.sysRole.count(),
      this.prisma.sysPermission.count(),
      this.prisma.sysDept.count(),
      this.prisma.aiProvider.count({ where: { deletedAt: null, enabled: true } }),
      this.prisma.aiModel.count({
        where: { enabled: true, provider: { deletedAt: null, enabled: true } },
      }),
      this.prisma.aiModel.findFirst({
        where: { isDefault: true, enabled: true, provider: { deletedAt: null, enabled: true } },
        select: { name: true },
      }),
      this.prisma.aiCallLog.aggregate({
        where: { createdAt: { gte: todayStart } },
        _count: { _all: true },
        _sum: { totalTokens: true, costEstimate: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.aiCallLog.count({
        where: { createdAt: { gte: todayStart }, status: 'error' },
      }),
      this.prisma.aiCallLog.aggregate({
        _count: { _all: true },
        _sum: { totalTokens: true },
      }),
    ]);

    return {
      system: {
        users,
        roles,
        permissions,
        departments,
      },
      ai: {
        providers,
        models,
        defaultModel: defaultModel?.name ?? null,
        callsToday: todayAgg._count._all,
        tokensToday: todayAgg._sum.totalTokens ?? 0,
        costToday: Number(todayAgg._sum.costEstimate ?? 0),
        errorsToday: todayErrors,
        avgLatencyToday: todayAgg._avg.latencyMs ? Math.round(todayAgg._avg.latencyMs) : null,
        callsTotal: totalsAgg._count._all,
        tokensTotal: totalsAgg._sum.totalTokens ?? 0,
      },
    };
  }

  /** 近 N 天 AI 调用趋势（无数据的日期补 0，保证图表连续） */
  async aiTrend(days = 14): Promise<AiTrendPointDto[]> {
    const start = startOfToday();
    start.setDate(start.getDate() - (days - 1));

    const rows = await this.prisma.$queryRaw<TrendRow[]>`
      SELECT
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS calls,
        COALESCE(SUM(total_tokens), 0)::int AS tokens,
        COALESCE(SUM(cost_estimate), 0)::double precision AS cost
      FROM ai_call_log
      WHERE created_at >= ${start}
      GROUP BY 1
      ORDER BY 1
    `;

    const byDate = new Map(rows.map((r) => [r.date, r]));
    const points: AiTrendPointDto[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < days; i++) {
      const key = formatDate(cursor);
      const row = byDate.get(key);
      points.push({
        date: key,
        calls: row?.calls ?? 0,
        tokens: Number(row?.tokens ?? 0),
        cost: Number(row?.cost ?? 0),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return points;
  }

  /** 最近 AI 调用记录（不含用户标识，仅调用维度信息） */
  async recentCalls(limit = 8): Promise<RecentAiCallDto[]> {
    const rows = await this.prisma.aiCallLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        model: true,
        status: true,
        latencyMs: true,
        totalTokens: true,
        costEstimate: true,
        errorMsg: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      costEstimate: row.costEstimate === null ? null : Number(row.costEstimate),
      errorMsg: row.errorMsg ? row.errorMsg.slice(0, 120) : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
