import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { PermissionCode } from '@/shared/constants/permission-code';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { AuthUser } from '@/shared/types/auth-user';

import { AiConfigService, ProviderView } from './ai-config.service';
import {
  ChatModelsResponseDto,
  CreateAiProviderDto,
  FetchModelsDto,
  UpdateAiProviderDto,
} from './dto/ai-config.dto';

@ApiTags('AI 模型配置')
@ApiBearerAuth()
@Controller('ai')
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Get('providers')
  @RequirePermissions(PermissionCode.AiConfigList)
  @ApiOperation({ summary: '供应商配置列表（含模型，apiKey 掩码）' })
  list(): Promise<ProviderView[]> {
    return this.aiConfigService.list();
  }

  @Post('providers')
  @RequirePermissions(PermissionCode.AiConfigCreate)
  @ApiOperation({ summary: '新增供应商（可携带模型列表）' })
  create(@Body() dto: CreateAiProviderDto, @CurrentUser() user: AuthUser): Promise<ProviderView> {
    return this.aiConfigService.create(dto, user.userId);
  }

  @Put('providers/:id')
  @RequirePermissions(PermissionCode.AiConfigUpdate)
  @ApiOperation({ summary: '修改供应商（models 传入则整体替换；apiKey 缺省保留原值）' })
  update(@Param('id') id: string, @Body() dto: UpdateAiProviderDto): Promise<ProviderView> {
    return this.aiConfigService.update(id, dto);
  }

  @Delete('providers/:id')
  @RequirePermissions(PermissionCode.AiConfigDelete)
  @ApiOperation({ summary: '删除供应商（软删除）' })
  remove(@Param('id') id: string): Promise<null> {
    return this.aiConfigService.remove(id);
  }

  @Post('providers/fetch-models')
  @RequirePermissions(PermissionCode.AiConfigList)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: '从端点自动发现模型列表（OpenAI 兼容 /models 或 Ollama /api/tags）' })
  fetchModels(@Body() dto: FetchModelsDto): Promise<{ ids: string[] }> {
    return this.aiConfigService.fetchRemoteModels(dto);
  }

  @Get('models')
  @RequirePermissions(PermissionCode.AiChatAsk)
  @ApiOperation({ summary: '对话页可用模型列表（含全局默认模型）' })
  chatModels(): Promise<ChatModelsResponseDto> {
    return this.aiConfigService.listChatModels();
  }
}
