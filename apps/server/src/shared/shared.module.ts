import { Global, Module } from '@nestjs/common';

import { DataScopeService } from './services/data-scope.service';
import { PermissionCacheService } from './services/permission-cache.service';

/** 共享层：提供全局守卫/拦截器依赖的服务，只许被依赖，不许反向依赖业务模块 */
@Global()
@Module({
  providers: [PermissionCacheService, DataScopeService],
  exports: [PermissionCacheService, DataScopeService],
})
export class SharedModule {}
