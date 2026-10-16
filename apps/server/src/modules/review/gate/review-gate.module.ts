import { Module } from '@nestjs/common';

import { ReviewGateController } from './review-gate.controller';
import { ReviewGateService } from './review-gate.service';

@Module({
  controllers: [ReviewGateController],
  providers: [ReviewGateService],
  exports: [ReviewGateService],
})
export class ReviewGateModule {}
