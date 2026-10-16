import { Module } from '@nestjs/common';

import { ReviewSharedModule } from '../shared/review-shared.module';
import { ReviewRepoController } from './review-repo.controller';
import { ReviewRepoService } from './review-repo.service';

@Module({
  imports: [ReviewSharedModule],
  controllers: [ReviewRepoController],
  providers: [ReviewRepoService],
  exports: [ReviewRepoService],
})
export class ReviewRepoModule {}
