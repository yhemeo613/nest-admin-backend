import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** 对话历史条目（多轮上下文） */
export class ChatHistoryItemDto {
  @ApiProperty({ description: '角色', enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({ description: '内容', example: '帮我查一下现在有多少用户' })
  @IsString()
  @Length(1, 4000)
  content: string;
}

export class ChatDto {
  @ApiProperty({ description: '用户消息', example: '你好，介绍一下你自己' })
  @IsString()
  @Length(1, 4000)
  message: string;

  @ApiPropertyOptional({ description: '指定模型（缺省用配置默认模型）' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: '指定模型配置 ID（AiModel.id，优先于 model 名称）' })
  @IsOptional()
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({
    description: '最近对话历史（最多 20 条，用于多轮意图理解）',
    type: [ChatHistoryItemDto],
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryItemDto)
  @ArrayMaxSize(20)
  history?: ChatHistoryItemDto[];

  @ApiPropertyOptional({ description: '采样温度 0-2', minimum: 0, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;
}

export class ChatResponseDto {
  @ApiProperty({ description: 'AI 回答内容' })
  content: string;

  @ApiProperty({ description: 'Token 用量', nullable: true })
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;

  @ApiProperty({ description: '实际命中模型' })
  model: string;
}
