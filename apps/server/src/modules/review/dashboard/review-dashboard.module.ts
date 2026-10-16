import { Module } from '@nestjs/common';

import { ReviewDashboardController } from './review-dashboard.controller';
import { ReviewDashboardService } from './review-dashboard.service';

@Module({
  controllers: [ReviewDashboardController],
  providers: [ReviewDashboardService],
})
export class ReviewDashboardModule {}
