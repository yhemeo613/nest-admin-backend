import { Body, Controller, MessageEvent, Post, Req, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Observable } from 'rxjs';

import { ErrorCode } from '@/shared/constants/error-code';
import { PermissionCode } from '@/shared/constants/permission-code';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { SkipWrap } from '@/shared/decorators/skip-wrap.decorator';
import { AuthUser } from '@/shared/types/auth-user';

import { AiChatService } from './ai-chat.service';
import { ChatDto, ChatResponseDto } from './dto/chat.dto';

@ApiTags('AI 对话')
@ApiBearerAuth()
@Controller('ai/chat')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Post()
  @RequirePermissions(PermissionCode.AiChatAsk)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI 对话（同步，限流 20 次/分钟）' })
  async chat(@Body() dto: ChatDto, @CurrentUser() user: AuthUser): Promise<ChatResponseDto> {
    const result = await this.aiChatService.chat(user, dto);
    return { content: result.content, usage: result.usage, model: result.model };
  }

  /**
   * AI 流式对话（SSE）。
   * 帧格式：data: {"delta":"...","done":false}；结束帧 done:true 附带 usage；错误帧带 code/message。
   */
  @Post('stream')
  @Sse()
  @SkipWrap()
  @RequirePermissions(PermissionCode.AiChatAsk)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI 对话（SSE 流式，text/event-stream）' })
  stream(
    @Body() dto: ChatDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    // 客户端断开连接时级联取消 LLM 调用，避免浪费 Token
    const abort = new AbortController();
    req.on('close', () => abort.abort());

    return new Observable<MessageEvent>((subscriber) => {
      void (async () => {
        try {
          for await (const delta of this.aiChatService.chatStream(user, dto, abort.signal)) {
            subscriber.next({ data: delta });
          }
        } catch (error) {
          subscriber.next({
            data: {
              code: ErrorCode.AI_CALL_FAILED,
              message: error instanceof Error ? error.message : 'AI 调用失败',
              done: true,
            },
          });
        } finally {
          subscriber.complete();
        }
      })();
    });
  }
}
