import { Module } from '@nestjs/common';

import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { AiUsageController } from './ai-usage.controller';

@Module({
  controllers: [AiChatController, AiUsageController],
  providers: [AiChatService],
})
export class AiChatModule {}
