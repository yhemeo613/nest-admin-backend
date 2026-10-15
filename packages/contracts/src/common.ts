/** 统一响应信封（后端全局拦截器包装形状；前端 http 封装解包后仅剩 data） */
export interface ApiEnvelope<T = unknown> {
  code: number;
  message: string;
  data: T;
  traceId?: string;
  timestamp: number;
}

/** 分页数据形状（后端 PageResult 与前端 PaginatedResponse 同形） */
export interface PaginatedResult<T = unknown> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
