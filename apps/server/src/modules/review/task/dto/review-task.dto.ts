import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewGateStatus, ReviewTaskMode, ReviewTaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

import { PaginationDto } from '@/shared/dto/pagination.dto';

/** 创建评审任务 */
export class CreateTaskDto {
  @ApiProperty({ description: '仓库 ID' })
  @IsUUID()
  repoId: string;

  @ApiPropertyOptional({ description: '模型配置 ID（缺省用默认模型）' })
  @IsOptional()
  @IsUUID()
  modelId?: string;

  @ApiProperty({
    enum: ReviewTaskMode,
    description: 'RANGE=分支区间 / COMMIT=单提交 / MR=MR/PR 链接',
  })
  @IsEnum(ReviewTaskMode)
  mode: ReviewTaskMode;

  @ApiPropertyOptional({ description: 'RANGE 基准 ref（分支/tag/sha）', example: 'main' })
  @IsOptional()
  @IsString()
  fromRef?: string;

  @ApiPropertyOptional({ description: 'RANGE 目标 ref（缺省 = 仓库默认分支）' })
  @IsOptional()
  @IsString()
  toRef?: string;

  @ApiPropertyOptional({ description: 'COMMIT 模式提交 sha' })
  @IsOptional()
  @IsString()
  commitSha?: string;

  @ApiPropertyOptional({
    description: 'MR/PR 链接（MR 模式必填；完成后自动回写）',
    example: 'https://gitlab.com/group/repo/-/merge_requests/123',
  })
  @IsOptional()
  @IsString()
  @Length(1, 512)
  mrUrl?: string;

  @ApiPropertyOptional({ description: '需求/业务背景（注入评审 prompt）' })
  @IsOptional()
  @IsString()
  @Length(0, 8000)
  requirementBackground?: string;
}

export class QueryTaskDto extends PaginationDto {
  @ApiPropertyOptional({ description: '仓库 ID' })
  @IsOptional()
  @IsUUID()
  repoId?: string;

  @ApiPropertyOptional({ enum: ReviewTaskStatus })
  @IsOptional()
  @IsEnum(ReviewTaskStatus)
  status?: ReviewTaskStatus;

  @ApiPropertyOptional({ enum: ReviewGateStatus })
  @IsOptional()
  @IsEnum(ReviewGateStatus)
  gateStatus?: ReviewGateStatus;
}

export class QueryFindingDto {
  @ApiPropertyOptional({ description: 'severity 筛选' })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ description: 'category 筛选' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '状态筛选', enum: ['OPEN', 'FIXED', 'IGNORED', 'RESOLVED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '只看新增' })
  @IsOptional()
  @IsString()
  isNew?: string;
}

export class UpdateFindingDto {
  @ApiProperty({ enum: ['OPEN', 'FIXED', 'IGNORED', 'RESOLVED'] })
  @IsString()
  status: 'OPEN' | 'FIXED' | 'IGNORED' | 'RESOLVED';
}

/** 任务出参（列表/详情共用） */
export class TaskResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() repoId: string;
  @ApiProperty({ nullable: true }) repoName: string | null;
  @ApiProperty({ nullable: true }) modelId: string | null;
  @ApiProperty({ nullable: true }) modelName: string | null;
  @ApiProperty({ enum: ReviewTaskMode }) mode: string;
  @ApiProperty({ nullable: true }) fromRef: string | null;
  @ApiProperty({ nullable: true }) toRef: string | null;
  @ApiProperty({ nullable: true }) commitSha: string | null;
  @ApiProperty({ nullable: true }) mrUrl: string | null;
  @ApiProperty({ nullable: true }) mrState: string | null;
  @ApiProperty({ nullable: true }) mrDiscussionUrl: string | null;
  @ApiProperty({ nullable: true }) requirementBackground: string | null;
  @ApiProperty({ enum: ReviewTaskStatus }) status: string;
  @ApiProperty() stage: string;
  @ApiProperty() progress: number;
  @ApiProperty({ enum: ReviewGateStatus, nullable: true }) gateStatus: string | null;
  @ApiProperty({ nullable: true, type: Object }) gateDetail: unknown;
  @ApiProperty({ nullable: true, type: Object }) stats: unknown;
  @ApiProperty({ nullable: true }) sessionId: string | null;
  @ApiProperty({ nullable: true }) error: string | null;
  @ApiProperty({ nullable: true }) startedAt: Date | null;
  @ApiProperty({ nullable: true }) finishedAt: Date | null;
  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty() createdAt: Date;
  // 列表附带聚合（查库时填）
  @ApiProperty({ description: '发现数（严重级分布）', type: Object })
  severityCount: Record<string, number>;
}

export class FindingResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() taskId: string;
  @ApiProperty() path: string;
  @ApiProperty() startLine: number;
  @ApiProperty() endLine: number;
  @ApiProperty() content: string;
  @ApiProperty({ nullable: true }) thinking: string | null;
  @ApiProperty() category: string;
  @ApiProperty() severity: string;
  @ApiProperty({ nullable: true }) suggestionCode: string | null;
  @ApiProperty({ nullable: true }) existingCode: string | null;
  @ApiProperty() fingerprint: string;
  @ApiProperty() status: string;
  @ApiProperty() isNew: boolean;
  @ApiProperty() createdAt: Date;
}

export class TraceCallItemDto {
  @ApiProperty() id: string;
  @ApiProperty() seq: number;
  @ApiProperty({ nullable: true }) requestNo: number | null;
  @ApiProperty({ nullable: true }) taskType: string | null;
  @ApiProperty({ nullable: true }) filePath: string | null;
  @ApiProperty({ nullable: true }) model: string | null;
  @ApiProperty() durationMs: number;
  @ApiProperty({ nullable: true }) statusCode: number | null;
  @ApiProperty({ nullable: true }) tokensIn: number | null;
  @ApiProperty({ nullable: true }) tokensOut: number | null;
  @ApiProperty() createdAt: Date;
}
