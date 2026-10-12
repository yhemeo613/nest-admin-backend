import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { AuthUser } from '@/shared/types/auth-user';

import { ClearReadDto, NotificationListResponseDto, ReadAllDto } from './dto/notification.dto';
import { NotificationService } from './notification.service';

/**
 * 站内通知（登录即可，按用户隔离）。
 * 未标注 @RequirePermissions：通知是个人收件箱，登录用户只能读写自己的数据。
 */
@ApiTags('站内通知')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '我的通知列表 + 各类型未读数' })
  list(@CurrentUser() user: AuthUser): Promise<NotificationListResponseDto> {
    return this.notificationService.list(user.userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: '单条标为已读' })
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<null> {
    return this.notificationService.markRead(user.userId, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: '全部标为已读（可限定类型）' })
  markAllRead(
    @Body() dto: ReadAllDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ affected: number }> {
    return this.notificationService.markAllRead(user.userId, dto.type);
  }

  @Delete('read')
  @ApiOperation({ summary: '清空已读（软删除，可限定类型）' })
  clearRead(
    @Query() query: ClearReadDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ affected: number }> {
    return this.notificationService.clearRead(user.userId, query.type);
  }
}
