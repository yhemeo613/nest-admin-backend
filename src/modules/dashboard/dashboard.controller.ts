import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';

import { DashboardService } from './dashboard.service';
import {
  AiTrendPointDto,
  AiTrendQueryDto,
  DashboardStatsDto,
  RecentAiCallDto,
  RecentCallsQueryDto,
} from './dto/dashboard.dto';

@ApiTags('工作台')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @RequirePermissions(PermissionCode.Dashboard)
  @ApiOperation({ summary: '工作台统计（系统资源计数 + AI 用量指标）' })
  stats(): Promise<DashboardStatsDto> {
    return this.dashboardService.stats();
  }

  @Get('ai-trend')
  @RequirePermissions(PermissionCode.Dashboard)
  @ApiOperation({ summary: '近 N 天 AI 调用趋势（按天补零）' })
  aiTrend(@Query() query: AiTrendQueryDto): Promise<AiTrendPointDto[]> {
    return this.dashboardService.aiTrend(query.days ?? 14);
  }

  @Get('recent-ai-calls')
  @RequirePermissions(PermissionCode.Dashboard)
  @ApiOperation({ summary: '最近 AI 调用记录' })
  recentCalls(@Query() query: RecentCallsQueryDto): Promise<RecentAiCallDto[]> {
    return this.dashboardService.recentCalls(query.limit ?? 8);
  }
}
