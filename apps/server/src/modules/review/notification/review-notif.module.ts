import { Module } from '@nestjs/common';

import { ReviewNotifController } from './review-notif.controller';
import { ReviewNotifService } from './review-notif.service';

@Module({
  controllers: [ReviewNotifController],
  providers: [ReviewNotifService],
  exports: [ReviewNotifService],
})
export class ReviewNotifModule {}
