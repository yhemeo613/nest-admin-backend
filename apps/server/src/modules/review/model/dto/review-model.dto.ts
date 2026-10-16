import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Status } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { PaginationDto } from '@/shared/dto/pagination.dto';

export enum ModelProtocol {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  OPENAI_RESPONSES = 'openai-responses',
}

/** 创建模型配置（apiKey 明文入参，落库密文） */
export class CreateModelDto {
  @ApiProperty({ description: '显示名', example: 'MiMo Flash' })
  @IsString()
  @Length(1, 64)
  name: string;

  @ApiProperty({ description: 'provider 预设', example: 'openai' })
  @IsString()
  @Length(1, 32)
  provider: string;

  @ApiProperty({ enum: ModelProtocol, description: '协议', default: ModelProtocol.OPENAI })
  @IsEnum(ModelProtocol)
  protocol: ModelProtocol;

  @ApiProperty({
    description: 'Endpoint，OpenAI 兼容为 {base}/chat/completions',
    example: 'https://api.example.com/v1',
  })
  @IsString()
  @Matches(/^https?:\/\/\S+$/, { message: 'baseUrl 必须是 http(s) 地址' })
  baseUrl: string;

  @ApiProperty({ description: 'API Key（加密存储，不再回传）' })
  @IsString()
  @Length(1, 512)
  apiKey: string;

  @ApiProperty({ description: '模型标识', example: 'mimo-v2.5-flash' })
  @IsString()
  @Length(1, 128)
  model: string;

  @ApiPropertyOptional({
    description: '注入 LLM 请求的额外 JSON（如 thinking 开关）',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  extraBody?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '设为默认模型', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** 修改模型配置（apiKey 缺省则保持原值） */
export class UpdateModelDto {
  @ApiPropertyOptional({ description: '显示名' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @ApiPropertyOptional({ description: 'provider 预设' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  provider?: string;

  @ApiPropertyOptional({ enum: ModelProtocol })
  @IsOptional()
  @IsEnum(ModelProtocol)
  protocol?: ModelProtocol;

  @ApiPropertyOptional({ description: 'Endpoint' })
  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\/\S+$/, { message: 'baseUrl 必须是 http(s) 地址' })
  baseUrl?: string;

  @ApiPropertyOptional({ description: 'API Key（明文，缺省不改）' })
  @IsOptional()
  @IsString()
  @Length(1, 512)
  apiKey?: string;

  @ApiPropertyOptional({ description: '模型标识' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  model?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  extraBody?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '设为默认模型' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ enum: Status })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}

export class QueryModelDto extends PaginationDto {
  @ApiPropertyOptional({ description: '名称/模型模糊搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: Status })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}

/** 模型配置出参（apiKey 永不出参） */
export class ModelResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() provider: string;
  @ApiProperty({ enum: ModelProtocol }) protocol: string;
  @ApiProperty() baseUrl: string;
  @ApiProperty() model: string;
  @ApiProperty({ nullable: true, type: Object }) extraBody: Record<string, unknown> | null;
  @ApiProperty() isDefault: boolean;
  @ApiProperty({ enum: Status }) status: string;
  @ApiProperty({ description: '是否已配置 API Key' }) hasApiKey: boolean;
  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class ModelTestResultDto {
  @ApiProperty({ description: '是否连通' }) ok: boolean;
  @ApiProperty({ description: '耗时（毫秒）' }) latencyMs: number;
  @ApiProperty({ description: '结果说明' }) message: string;
}
