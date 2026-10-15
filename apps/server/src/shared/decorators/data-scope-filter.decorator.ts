import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { DATA_SCOPE_FILTER_KEY } from './data-scope.decorator';

/** 取出 DataScopeInterceptor 计算好的数据范围 where 片段 */
export const DataScopeFilter = createParamDecorator((_, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
  return (request[DATA_SCOPE_FILTER_KEY] ?? {}) as Record<string, unknown>;
});
