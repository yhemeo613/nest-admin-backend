import { Body, Controller, Headers, MessageEvent, Post, Req, Sse } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Observable } from 'rxjs';

import { ErrorCode } from '@/shared/constants/error-code';
import { Public } from '@/shared/decorators/public.decorator';
import { SkipWrap } from '@/shared/decorators/skip-wrap.decorator';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { VisitorChatDto } from './dto/visitor-chat.dto';
import { VisitorChatService } from './visitor-chat.service';

/**
 * 访客侧公开对话接口（挂件/开放 API 用）。
 * @Public 免 JWT，但必须携带有效 X-Api-Key（服务内校验，无效返回 401）。
 */
@ApiTags('SaaS 访客对话')
@ApiSecurity('X-Api-Key')
@Controller('saas/visitor')
export class VisitorChatController {
  constructor(private readonly visitorChatService: VisitorChatService) {}

  /**
   * 访客流式对话（SSE）。
   * 首帧回传 conversationId（续聊时带上）；后续帧 { delta, done }；
   * 结束帧 done:true 附带 usage/model；错误帧带 code/message。
   */
  @Post('chat/stream')
  @Public()
  @Sse()
  @SkipWrap()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: '访客 AI 对话（SSE 流式，X-Api-Key 鉴权，限流 30 次/分钟）' })
  stream(
    @Body() dto: VisitorChatDto,
    @Headers('x-api-key') apiKey: string,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    // 客户端断开时级联取消 LLM 调用，避免浪费 Token（已产出内容仍会落库）
    const abort = new AbortController();
    req.on('close', () => abort.abort());

    return new Observable<MessageEvent>((subscriber) => {
      void (async () => {
        try {
          for await (const frame of this.visitorChatService.stream(apiKey, dto, abort.signal)) {
            subscriber.next({ data: frame });
          }
        } catch (error) {
          const biz = error instanceof BusinessException ? error : null;
          subscriber.next({
            data: {
              code: biz?.bizCode ?? ErrorCode.AI_CALL_FAILED,
              message: biz?.message ?? (error instanceof Error ? error.message : 'AI 调用失败'),
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
