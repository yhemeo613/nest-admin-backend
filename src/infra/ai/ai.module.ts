import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LLM_PROVIDER } from './ai.constants';
import { AiService } from './ai.service';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiUsageService } from './ai-usage.service';
import { createLlmProvider } from './providers/provider.factory';

/** AI 基础设施：全局模块，业务模块直接注入 AiService / AiProviderRegistry 即可 */
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
    AiProviderRegistry,
  ],
  exports: [AiService, AiUsageService, AiProviderRegistry],
})
export class AiModule {}
