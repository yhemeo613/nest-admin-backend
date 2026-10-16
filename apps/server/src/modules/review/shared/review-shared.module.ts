import { Module } from '@nestjs/common';

import { GitWorkspaceService } from './git-workspace.service';
import { ReviewCryptoService } from './review-crypto.service';

/** 评审域共享服务：密文加解密 + Git 工作区 */
@Module({
  providers: [ReviewCryptoService, GitWorkspaceService],
  exports: [ReviewCryptoService, GitWorkspaceService],
})
export class ReviewSharedModule {}
