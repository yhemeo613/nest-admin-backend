import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

import { PaginationDto } from '@/shared/dto/pagination.dto';

/** 会话分页查询 */
export class QueryConversationDto extends PaginationDto {
  @ApiPropertyOptional({ description: '租户 ID 过滤' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: '访客 ID 过滤' })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  visitorId?: string;

  @ApiPropertyOptional({ description: '状态', enum: ['OPEN', 'CLOSED'] })
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: 'OPEN' | 'CLOSED';
}

/** 会话列表项 */
export interface ConversationView {
  id: string;
  tenantId: string;
  tenantName: string | null;
  visitorId: string;
  title: string | null;
  status: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 会话消息 */
export interface MessageView {
  id: string;
  role: string;
  content: string;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  createdAt: Date;
}

/** 会话详情（含全部消息） */
export interface ConversationDetailView extends ConversationView {
  messages: MessageView[];
}

export type { PageResult } from '@/shared/dto/pagination.dto';
