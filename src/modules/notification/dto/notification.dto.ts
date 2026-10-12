import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/** 通知类型（与前端页签对应） */
export const NOTIFICATION_TYPES = ['NOTICE', 'MESSAGE', 'TODO'] as const;
export type NotificationTypeValue = (typeof NOTIFICATION_TYPES)[number];

export class NotificationItemDto {
  @ApiProperty({ description: '通知 ID' })
  id: string;

  @ApiProperty({ description: '类型 NOTICE/MESSAGE/TODO', enum: NOTIFICATION_TYPES })
  type: NotificationTypeValue;

  @ApiProperty({ description: '标题' })
  title: string;

  @ApiPropertyOptional({ description: '正文', nullable: true })
  content: string | null;

  @ApiPropertyOptional({ description: '跳转路由', nullable: true })
  link: string | null;

  @ApiProperty({ description: '是否已读' })
  read: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationItemDto] })
  list: NotificationItemDto[];

  /** 各类型未读数 { NOTICE, MESSAGE, TODO } */
  @ApiProperty({ description: '各类型未读数' })
  counts: Record<NotificationTypeValue, number>;

  @ApiProperty({ description: '未读总数' })
  totalUnread: number;
}

export class ReadAllDto {
  @ApiPropertyOptional({ description: '限定类型（缺省全部）', enum: NOTIFICATION_TYPES })
  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: NotificationTypeValue;
}

export class ClearReadDto {
  @ApiPropertyOptional({ description: '限定类型（缺省全部）', enum: NOTIFICATION_TYPES })
  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: NotificationTypeValue;
}

export class CreateNotificationDto {
  @ApiProperty({ description: '接收者用户 ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: '类型', enum: NOTIFICATION_TYPES })
  @IsIn(NOTIFICATION_TYPES)
  type: NotificationTypeValue;

  @ApiProperty({ description: '标题' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: '正文' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '跳转路由' })
  @IsOptional()
  @IsString()
  link?: string;
}
