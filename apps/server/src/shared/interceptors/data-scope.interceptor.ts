import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';

import {
  DATA_SCOPE_FILTER_KEY,
  DATA_SCOPE_KEY,
  ResolvedDataScopeOptions,
} from '@/shared/decorators/data-scope.decorator';
import { DataScopeService } from '@/shared/services/data-scope.service';
import { AuthUser } from '@/shared/types/auth-user';

/**
 * 数据行级权限拦截器：
 * 仅作用于标注 @DataScope() 的接口，把计算好的 where 片段挂到请求上，
 * 由 @DataScopeFilter() 参数装饰器取出。
 */
@Injectable()
export class DataScopeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const options = this.reflector.get<ResolvedDataScopeOptions | undefined>(
      DATA_SCOPE_KEY,
      context.getHandler(),
    );
    if (options) {
      const request = context
        .switchToHttp()
        .getRequest<Request & { user?: AuthUser } & Record<string, unknown>>();
      if (request.user) {
        request[DATA_SCOPE_FILTER_KEY] = await this.dataScopeService.buildFilter(
          request.user,
          options,
        );
      }
    }
    return next.handle();
  }
}
