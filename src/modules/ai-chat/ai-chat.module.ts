import { Module } from '@nestjs/common';

import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { AiToolsService } from './ai-tools.service';
import { AiUsageController } from './ai-usage.controller';

@Module({
  controllers: [AiChatController, AiUsageController],
  providers: [AiChatService, AiToolsService],
})
export class AiChatModule {}
