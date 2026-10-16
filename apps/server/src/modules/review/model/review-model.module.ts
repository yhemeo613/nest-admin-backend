import { Module } from '@nestjs/common';

import { ReviewSharedModule } from '../shared/review-shared.module';
import { ReviewModelController } from './review-model.controller';
import { ReviewModelService } from './review-model.service';

@Module({
  imports: [ReviewSharedModule],
  controllers: [ReviewModelController],
  providers: [ReviewModelService],
  exports: [ReviewModelService],
})
export class ReviewModelModule {}
