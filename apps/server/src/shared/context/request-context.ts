import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestStore {
  traceId: string;
  userId?: string;
}

/**
 * 请求级上下文：基于 AsyncLocalStorage 在整条调用链中透传 traceId/userId，
 * 业务代码与日志无需显式传参即可关联同一次请求。
 */
class RequestContext {
  private readonly als = new AsyncLocalStorage<RequestStore>();

  run<T>(store: RequestStore, callback: () => T): T {
    return this.als.run(store, callback);
  }

  get traceId(): string | undefined {
    return this.als.getStore()?.traceId;
  }

  get userId(): string | undefined {
    return this.als.getStore()?.userId;
  }

  setUserId(userId: string): void {
    const store = this.als.getStore();
    if (store) store.userId = userId;
  }
}

export const requestContext = new RequestContext();
