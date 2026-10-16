import { Controller, MessageEvent, Param, ParseUUIDPipe, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { SkipWrap } from '@/shared/decorators/skip-wrap.decorator';

import { ReviewEventsService } from './review-events.service';
import { ReviewTaskService } from './review-task.service';

/**
 * 任务实时事件流（SSE）。
 * 鉴权走全局 JwtAuthGuard：前端用 fetch-SSE 客户端携带 Authorization header。
 * 首帧推送当前任务快照，后续转发 Redis 频道的 stage/log/trace_call/finished 事件。
 */
@ApiTags('代码评审-任务实时流')
@ApiBearerAuth()
@Controller('review/tasks')
export class ReviewSseController {
  constructor(
    private readonly events: ReviewEventsService,
    private readonly taskService: ReviewTaskService,
  ) {}

  @Sse(':id/events')
  @SkipWrap()
  @ApiOperation({ summary: '任务实时事件流（stage/log/trace_call/finished）' })
  stream(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      const { iterator, close } = this.events.subscribe(id);

      // 首帧：任务快照，让后进页面的客户端立即同步状态
      this.taskService
        .findOne(id)
        .then((task) => {
          if (closed) return;
          subscriber.next({
            data: {
              type: 'snapshot',
              status: task.status,
              stage: task.stage,
              progress: task.progress,
              gateStatus: task.gateStatus,
            },
          });
        })
        .catch((e) => subscriber.error(e));

      void (async () => {
        try {
          for await (const raw of iterator) {
            if (closed) break;
            subscriber.next({ data: JSON.parse(raw) as Record<string, unknown> });
            // finished 后服务端主动收尾
            const parsed = JSON.parse(raw) as { type?: string };
            if (parsed.type === 'finished') break;
          }
        } catch (e) {
          if (!closed) subscriber.error(e);
          return;
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
