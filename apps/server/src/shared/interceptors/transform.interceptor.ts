import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { map, Observable } from 'rxjs';

import { requestContext } from '@/shared/context/request-context';
import { SKIP_WRAP_KEY } from '@/shared/decorators/skip-wrap.decorator';
import { ApiResponse } from '@/shared/types/auth-user';

/** 统一响应包装：{ code, message, data, traceId, timestamp }；@SkipWrap() 场景（SSE/文件）跳过 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const skipWrap = this.reflector.getAllAndOverride<boolean>(SKIP_WRAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipWrap) return next.handle() as Observable<ApiResponse<T>>;

    const request = context.switchToHttp().getRequest<Request & { id?: string }>();
    const traceId = requestContext.traceId ?? request.id;

    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'ok',
        data,
        traceId,
        timestamp: Date.now(),
      })),
    );
  }
}
