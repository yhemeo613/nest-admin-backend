import { Module } from '@nestjs/common';

import { ApiKeyController } from './api-key.controller';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { KbController } from './kb.controller';
import { KbService } from './kb.service';
import { KbArticleService } from './kb-article.service';
import { KbSearchService } from './kb-search.service';
import { PublicController } from './public/public.controller';
import { PublicService } from './public/public.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { VisitorChatController } from './visitor-chat.controller';
import { VisitorChatService } from './visitor-chat.service';
import { WidgetController } from './widget/widget.controller';

/**
 * SaaS 多租户模块：租户运营 + 接入凭证 + 访客会话 + 访客对话 + 知识库。
 * AiGateway（LangChain 门面）来自全局 AiModule。
 */
@Module({
  controllers: [
    TenantController,
    ApiKeyController,
    ConversationController,
    VisitorChatController,
    KbController,
    PublicController,
    WidgetController,
  ],
  providers: [
    TenantService,
    ConversationService,
    VisitorChatService,
    KbService,
    KbArticleService,
    KbSearchService,
    PublicService,
  ],
  exports: [TenantService, VisitorChatService, KbSearchService, KbArticleService],
})
export class SaasModule {}
