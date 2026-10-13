import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

import { PaginationDto } from '@/shared/dto/pagination.dto';

// ==================== 知识库 ====================

export class QueryKbDto extends PaginationDto {
  @ApiPropertyOptional({ description: '关键词（名称模糊匹配）' })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  keyword?: string;

  @ApiPropertyOptional({ description: '租户 ID 过滤' })
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class CreateKbDto {
  @ApiPropertyOptional({
    description: '所属租户 ID（平台侧必传；租户管理员缺省为自己的租户）',
    example: 'seed-tenant-demo',
  })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ description: '知识库名称', example: '售后政策库' })
  @IsString()
  @Length(1, 64)
  name: string;

  @ApiPropertyOptional({ description: '说明' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @ApiPropertyOptional({ description: '排序', example: 0 })
  @IsOptional()
  sort?: number;
}

export class UpdateKbDto {
  @ApiPropertyOptional({ description: '知识库名称' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @ApiPropertyOptional({ description: '说明' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @ApiPropertyOptional({ description: '排序' })
  @IsOptional()
  sort?: number;

  @ApiPropertyOptional({ description: '状态', enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: 'ENABLED' | 'DISABLED';
}

// ==================== 文章 ====================

export class QueryArticleDto extends PaginationDto {
  @ApiPropertyOptional({ description: '关键词（标题/正文模糊匹配）' })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  keyword?: string;

  @ApiPropertyOptional({ description: '状态', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @ApiPropertyOptional({ description: '标签过滤' })
  @IsOptional()
  @IsString()
  tagId?: string;
}

export class SaveArticleDto {
  @ApiProperty({ description: '标题', example: '如何申请退货' })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({
    description: 'URL 标识（同库唯一，小写字母/数字/中划线）',
    example: 'return-policy',
  })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/, {
    message: 'slug 仅支持小写字母、数字、中划线，长度 3-60',
  })
  slug: string;

  @ApiProperty({ description: '正文（Markdown）', example: '## 退货条件\n\n七天内无理由…' })
  @IsString()
  @Length(1, 100_000)
  content: string;

  @ApiPropertyOptional({
    description: '状态',
    enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
    default: 'DRAFT',
  })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @ApiPropertyOptional({ description: 'SEO 标题（缺省回填标题）' })
  @IsOptional()
  @IsString()
  @Length(0, 120)
  seoTitle?: string;

  @ApiPropertyOptional({ description: 'SEO 描述（缺省取正文摘要）' })
  @IsOptional()
  @IsString()
  @Length(0, 300)
  seoDescription?: string;

  @ApiPropertyOptional({ description: '标签 ID 列表', type: [String] })
  @IsOptional()
  @IsString({ each: true })
  tagIds?: string[];
}

// ==================== 标签 ====================

export class CreateTagDto {
  @ApiProperty({ description: '标签名', example: '退货' })
  @IsString()
  @Length(1, 30)
  name: string;
}

// ==================== 视图 ====================

export interface KbView {
  id: string;
  tenantId: string;
  tenantName: string | null;
  name: string;
  description: string | null;
  sort: number;
  status: 'ENABLED' | 'DISABLED';
  articleCount: number;
  publishedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArticleTagRef {
  id: string;
  name: string;
}

export interface ArticleView {
  id: string;
  kbId: string;
  tenantId: string;
  title: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | null;
  viewCount: number;
  tags: ArticleTagRef[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ArticleDetailView extends ArticleView {
  content: string;
}

export interface TagView {
  id: string;
  name: string;
  articleCount: number;
}

export type { PageResult } from '@/shared/dto/pagination.dto';
