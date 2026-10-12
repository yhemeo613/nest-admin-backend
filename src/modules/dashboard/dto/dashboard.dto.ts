import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class AiTrendQueryDto {
  @ApiPropertyOptional({
    description: '趋势天数（1-90，默认 14）',
    default: 14,
    minimum: 1,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

export class RecentCallsQueryDto {
  @ApiPropertyOptional({
    description: '返回条数（1-50，默认 8）',
    default: 8,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SystemStatsDto {
  users: number;
  roles: number;
  permissions: number;
  departments: number;
}

export class AiStatsDto {
  providers: number;
  models: number;
  defaultModel: string | null;
  callsToday: number;
  tokensToday: number;
  costToday: number;
  errorsToday: number;
  avgLatencyToday: number | null;
  callsTotal: number;
  tokensTotal: number;
}

export class DashboardStatsDto {
  system: SystemStatsDto;
  ai: AiStatsDto;
}

export class AiTrendPointDto {
  /** 日期 YYYY-MM-DD */
  date: string;
  calls: number;
  tokens: number;
  cost: number;
}

export class RecentAiCallDto {
  id: string;
  provider: string;
  model: string;
  status: string;
  latencyMs: number;
  totalTokens: number;
  costEstimate: number | null;
  errorMsg: string | null;
  createdAt: string;
}
