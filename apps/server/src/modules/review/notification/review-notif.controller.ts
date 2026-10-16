import {
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewNotif } from '@prisma/client';
import { Observable } from 'rxjs';

import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { SkipWrap } from '@/shared/decorators/skip-wrap.decorator';
import { PaginationDto } from '@/shared/dto/pagination.dto';
import { AuthUser } from '@/shared/types/auth-user';

import { ReviewNotifService } from './review-notif.service';

@ApiTags('代码评审-通知')
@ApiBearerAuth()
@Controller('review/notifications')
export class ReviewNotifController {
  constructor(private readonly notifService: ReviewNotifService) {}

  @Get()
  @ApiOperation({ summary: '通知列表（登录即可）' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationDto,
  ): Promise<{ list: ReviewNotif[]; total: number }> {
    return this.notifService.list(user.userId, query.page, query.pageSize);
  }

  @Get('unread-count')
  @ApiOperation({ summary: '未读数' })
  async unreadCount(@CurrentUser() user: AuthUser): Promise<{ count: number }> {
    return { count: await this.notifService.unreadCount(user.userId) };
  }

  @Put(':id/read')
  @ApiOperation({ summary: '标记已读' })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<null> {
    await this.notifService.markRead(user.userId, id);
    return null;
  }

  @Put('read-all')
  @ApiOperation({ summary: '全部已读' })
  async markAllRead(@CurrentUser() user: AuthUser): Promise<null> {
    await this.notifService.markAllRead(user.userId);
    return null;
  }

  @Sse('events')
  @SkipWrap()
  @ApiOperation({ summary: '通知实时推送（SSE，订阅全员频道 + 个人频道）' })
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      const { iterator, close } = this.notifService.subscribe(user.userId);
      void (async () => {
        try {
          for await (const raw of iterator) {
            if (closed) break;
            subscriber.next({ data: JSON.parse(raw) as Record<string, unknown> });
          }
        } catch {
          // 订阅连接异常：静默结束，前端负责重连
        }
        if (!closed) subscriber.complete();
      })();

      return () => {
        closed = true;
        void close();
      };
    });
  }
}
