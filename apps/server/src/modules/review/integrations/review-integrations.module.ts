import { Module } from '@nestjs/common';

import { ReviewSharedModule } from '../shared/review-shared.module';
import { MrIntegrationService } from './mr-integration.service';

/** MR/PR 平台集成：GitLab/GitHub refs 解析与评论回写 */
@Module({
  imports: [ReviewSharedModule],
  providers: [MrIntegrationService],
  exports: [MrIntegrationService],
})
export class ReviewIntegrationsModule {}
