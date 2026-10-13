import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

import { PaginationDto } from '@/shared/dto/pagination.dto';

/** 租户分页查询 */
export class QueryTenantDto extends PaginationDto {
  @ApiPropertyOptional({ description: '关键词（名称/编码模糊匹配）' })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  keyword?: string;

  @ApiPropertyOptional({ description: '状态', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: 'ENABLED' | 'DISABLED';
}

export class CreateTenantDto {
  @ApiProperty({ description: '租户名称', example: '星辰电商' })
  @IsString()
  @Length(1, 64)
  name: string;

  @ApiProperty({ description: '租户编码（全局唯一，小写字母/数字/中划线）', example: 'xingchen' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, {
    message: '编码仅支持小写字母、数字、中划线，长度 3-32',
  })
  code: string;

  @ApiPropertyOptional({ description: '联系人', example: '张三' })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  contactName?: string;

  @ApiPropertyOptional({ description: '联系邮箱', example: 'support@example.com' })
  @IsOptional()
  @IsString()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: '邮箱格式不正确' })
  contactEmail?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  remark?: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ description: '租户名称' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @ApiPropertyOptional({ description: '租户编码' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, {
    message: '编码仅支持小写字母、数字、中划线，长度 3-32',
  })
  code?: string;

  @ApiPropertyOptional({ description: '联系人' })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  contactName?: string;

  @ApiPropertyOptional({ description: '联系邮箱' })
  @IsOptional()
  @IsString()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: '邮箱格式不正确' })
  contactEmail?: string;

  @ApiPropertyOptional({ description: '状态', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: 'ENABLED' | 'DISABLED';

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  remark?: string;
}

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Key 名称（用途备注）', example: '官网挂件' })
  @IsString()
  @Length(1, 64)
  name: string;
}

/** 租户视图（列表/详情） */
export interface TenantView {
  id: string;
  name: string;
  code: string;
  contactName: string | null;
  contactEmail: string | null;
  status: 'ENABLED' | 'DISABLED';
  remark: string | null;
  conversationCount: number;
  apiKeyCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** API Key 视图（keyHash 不回传；plaintext 仅创建响应携带） */
export interface ApiKeyView {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  status: 'ENABLED' | 'DISABLED';
  lastUsedAt: Date | null;
  createdAt: Date;
  /** 明文 Key，仅创建时返回一次 */
  plaintext?: string;
}

export type { PageResult } from '@/shared/dto/pagination.dto';
