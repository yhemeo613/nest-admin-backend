import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

// @IsOptional() 会放行 null 与 undefined：null = 清除该限制，undefined = 不修改
export class CreateGateDto {
  @ApiPropertyOptional({ description: '仓库 ID（缺省 = 全局默认规则）' })
  @IsOptional()
  @IsUUID()
  repoId?: string;

  @ApiPropertyOptional({ description: 'critical 数上限（缺省 = 不限制）', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxCritical?: number | null;

  @ApiPropertyOptional({ description: 'high 数上限（缺省 = 不限制）', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxHigh?: number | null;
}

export class UpdateGateDto {
  @ApiPropertyOptional({ description: 'critical 数上限（null = 清除限制）', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxCritical?: number | null;

  @ApiPropertyOptional({ description: 'high 数上限（null = 清除限制）', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxHigh?: number | null;
}

export class GateResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true, description: '仓库 ID（null = 全局默认）' })
  repoId: string | null;
  @ApiProperty({ nullable: true, description: '仓库名（全局规则为 null）' })
  repoName: string | null;
  @ApiProperty({ nullable: true }) maxCritical: number | null;
  @ApiProperty({ nullable: true }) maxHigh: number | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
