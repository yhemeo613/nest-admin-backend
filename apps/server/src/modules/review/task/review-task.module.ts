import { Module } from '@nestjs/common';

import { ReviewGateModule } from '../gate/review-gate.module';
import { ReviewIntegrationsModule } from '../integrations/review-integrations.module';
import { ReviewModelModule } from '../model/review-model.module';
import { ReviewRepoModule } from '../repo/review-repo.module';
import { ReviewSharedModule } from '../shared/review-shared.module';
import { OcrExecutorService } from './executors/ocr-executor.service';
import { ReviewEventsService } from './review-events.service';
import { ReviewFindingController } from './review-finding.controller';
import { ReviewQueueService } from './review-queue.service';
import { ReviewSseController } from './review-sse.controller';
import { ReviewTaskController } from './review-task.controller';
import { ReviewTaskService } from './review-task.service';
import { ReviewWorkerService } from './review-worker.service';

/** 评审任务：创建/队列/执行器/解析/发现/轨迹/SSE */
@Module({
  imports: [
    ReviewSharedModule,
    ReviewModelModule,
    ReviewRepoModule,
    ReviewGateModule,
    ReviewIntegrationsModule,
  ],
  controllers: [ReviewTaskController, ReviewFindingController, ReviewSseController],
  providers: [
    ReviewQueueService,
    ReviewEventsService,
    ReviewTaskService,
    ReviewWorkerService,
    OcrExecutorService,
  ],
  exports: [ReviewTaskService],
})
export class ReviewTaskModule {}
