import { Global, Module } from '@nestjs/common';

import { AiRegistry } from './ai.registry';
import { AiAgentService } from './ai-agent.service';
import { AiGateway } from './ai-gateway.service';
import { AiUsageService } from './ai-usage.service';

/** AI 基础设施（LangChain 架构）：全局模块，业务模块直接注入 AiGateway / AiAgentService */
@Global()
@Module({
  providers: [AiRegistry, AiUsageService, AiGateway, AiAgentService],
  exports: [AiRegistry, AiUsageService, AiGateway, AiAgentService],
})
export class AiModule {}
