import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { AI_PROTOCOL_VALUES } from '@/infra/ai/ai.constants';

/** 单个模型配置（嵌套在供应商创建/更新里，整体替换） */
export class AiModelInputDto {
  @ApiPropertyOptional({ description: '模型配置 ID（更新时传入以保留该行）' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: '模型 ID（请求上游时使用，如 gpt-4o-mini）', example: 'gpt-4o-mini' })
  @IsString()
  @Length(1, 128)
  name: string;

  @ApiPropertyOptional({ description: '显示名（下拉展示用，缺省显示模型 ID）' })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  label?: string;

  @ApiPropertyOptional({ description: '最大输出 tokens（覆盖全局 AI_MAX_TOKENS）', example: 4096 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxOutput?: number;

  @ApiPropertyOptional({ description: '上下文窗口 tokens（展示/提示用）', example: 131072 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  contextWindow?: number;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: '是否为默认模型（全局唯一）', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: '排序（小在前）', default: 0 })
  @IsOptional()
  @IsInt()
  sort?: number;
}

export class CreateAiProviderDto {
  @ApiProperty({ description: '供应商名称', example: 'Xiaomi MiMo' })
  @IsString()
  @Length(1, 64)
  name: string;

  @ApiProperty({ description: '上游协议格式', enum: AI_PROTOCOL_VALUES, example: 'OPENAI_COMPAT' })
  @IsIn(AI_PROTOCOL_VALUES)
  protocol: string;

  @ApiProperty({
    description: '端点地址（OpenAI 兼容通常以 /v1 结尾；Ollama 如 http://localhost:11434）',
    example: 'https://api.openai.com/v1',
  })
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true })
  @Length(1, 512)
  baseUrl: string;

  @ApiPropertyOptional({ description: 'API Key（缺省不传；更新时不传表示保留原值）' })
  @IsOptional()
  @IsString()
  @Length(0, 1024)
  apiKey?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  remark?: string;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: '排序', default: 0 })
  @IsOptional()
  @IsInt()
  sort?: number;

  @ApiPropertyOptional({ description: '模型列表（整体替换）', type: [AiModelInputDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AiModelInputDto)
  models?: AiModelInputDto[];
}

export class UpdateAiProviderDto extends PartialType(CreateAiProviderDto) {}

export class FetchModelsDto {
  @ApiProperty({ description: '端点地址', example: 'https://api.openai.com/v1' })
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true })
  @Length(1, 512)
  baseUrl: string;

  @ApiPropertyOptional({ description: 'API Key' })
  @IsOptional()
  @IsString()
  @Length(0, 1024)
  apiKey?: string;

  @ApiProperty({ description: '上游协议格式', enum: AI_PROTOCOL_VALUES, example: 'OPENAI_COMPAT' })
  @IsIn(AI_PROTOCOL_VALUES)
  protocol: string;
}

export class AiModelItemDto {
  id: string;
  name: string;
  label: string;
  providerName: string;
  maxOutput: number | null;
  contextWindow: number | null;
  isDefault: boolean;
}

export class ChatModelsResponseDto {
  /** 全局默认模型 ID（无则取排序首个启用模型） */
  defaultModelId: string | null;
  list: AiModelItemDto[];
}
