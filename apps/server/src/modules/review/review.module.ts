import { Module } from '@nestjs/common';

import { ReviewDashboardModule } from './dashboard/review-dashboard.module';
import { ReviewGateModule } from './gate/review-gate.module';
import { ReviewIntegrationsModule } from './integrations/review-integrations.module';
import { ReviewModelModule } from './model/review-model.module';
import { ReviewNotifModule } from './notification/review-notif.module';
import { ReviewRepoModule } from './repo/review-repo.module';
import { ReviewSharedModule } from './shared/review-shared.module';
import { ReviewTaskModule } from './task/review-task.module';

/** 代码评审（NestReview）：模型/仓库/任务/红线/集成/通知/工作台聚合 */
@Module({
  imports: [
    ReviewSharedModule,
    ReviewModelModule,
    ReviewRepoModule,
    ReviewGateModule,
    ReviewIntegrationsModule,
    ReviewTaskModule,
    ReviewNotifModule,
    ReviewDashboardModule,
  ],
})
export class ReviewModule {}
