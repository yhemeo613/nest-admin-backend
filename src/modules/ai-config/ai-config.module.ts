import { Module } from '@nestjs/common';

import { AiConfigController } from './ai-config.controller';
import { AiConfigService } from './ai-config.service';

/** AI 供应商/模型配置（数据库配置优先，env 仅作 bootstrap 兜底） */
@Module({
  controllers: [AiConfigController],
  providers: [AiConfigService],
  exports: [AiConfigService],
})
export class AiConfigModule {}
