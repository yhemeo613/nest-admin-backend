import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

/**
 * 访客对话入参（公开接口，X-Api-Key 头部鉴权）。
 * conversationId 缺省时自动新建会话并随首帧返回。
 */
export class VisitorChatDto {
  @ApiProperty({ description: '访客标识（挂件在访客浏览器持久化生成）', example: 'v-8f3a2b1c' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/, { message: 'visitorId 仅支持字母、数字、下划线、中划线' })
  visitorId: string;

  @ApiPropertyOptional({ description: '会话 ID（续聊时传入，缺省新建会话）' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  conversationId?: string;

  @ApiProperty({ description: '用户消息', example: '你们的退货政策是什么？' })
  @IsString()
  @Length(1, 4000)
  message: string;

  @ApiPropertyOptional({ description: '指定模型配置 ID（缺省用平台默认模型）' })
  @IsOptional()
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({ description: '限定知识库 ID（缺省取该租户第一个启用的知识库）' })
  @IsOptional()
  @IsString()
  kbId?: string;

  @ApiPropertyOptional({ description: '采样温度 0-2', minimum: 0, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;
}
