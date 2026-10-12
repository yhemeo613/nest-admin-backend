import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LLM_PROVIDER } from './ai.constants';
import { AiService } from './ai.service';
import { AiUsageService } from './ai-usage.service';
import { createLlmProvider } from './providers/provider.factory';

/** AI 基础设施：全局模块，业务模块直接注入 AiService 即可 */
@Global()
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      useFactory: (config: ConfigService) => createLlmProvider(config),
      inject: [ConfigService],
    },
    AiService,
    AiUsageService,
  ],
  exports: [AiService, AiUsageService],
})
export class AiModule {}
