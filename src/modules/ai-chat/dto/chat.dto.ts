import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ChatDto {
  @ApiProperty({ description: '用户消息', example: '你好，介绍一下你自己' })
  @IsString()
  @Length(1, 4000)
  message: string;

  @ApiPropertyOptional({ description: '指定模型（缺省用配置默认模型）' })
  @IsOptional()
  @IsString()
  model?: string;

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
