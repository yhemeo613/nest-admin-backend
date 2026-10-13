import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { PageResult } from '@/shared/dto/pagination.dto';
import { AuthUser } from '@/shared/types/auth-user';

import { ConversationService } from './conversation.service';
import {
  ConversationDetailView,
  ConversationView,
  QueryConversationDto,
} from './dto/conversation.dto';

@ApiTags('SaaS 访客会话')
@ApiBearerAuth()
@Controller('saas/conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  @RequirePermissions(PermissionCode.SaasConversationList)
  @ApiOperation({ summary: '访客会话分页列表（租户管理员强制只看自己租户）' })
  page(
    @Query() query: QueryConversationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PageResult<ConversationView>> {
    return this.conversationService.page(query, user);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.SaasConversationDetail)
  @ApiOperation({ summary: '会话详情（含全部消息）' })
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ConversationDetailView> {
    return this.conversationService.detail(id, user);
  }
}
