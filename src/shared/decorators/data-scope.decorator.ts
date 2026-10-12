import { SetMetadata } from '@nestjs/common';

export const DATA_SCOPE_KEY = 'dataScope';
export const DATA_SCOPE_FILTER_KEY = 'dataScopeFilter';

export interface DataScopeOptions {
  /** 部门字段名（Prisma 模型字段），默认 deptId */
  deptField?: string;
  /** 归属人字段名，默认 createdBy */
  ownerField?: string;
}

/** 装饰器填充默认值后的解析结果 */
export interface ResolvedDataScopeOptions {
  deptField: string;
  ownerField: string;
}

/**
 * 为列表查询接口开启数据行级权限过滤。
 * 拦截器会根据当前用户角色的 dataScope 生成 where 片段，
 * 业务侧通过 @DataScopeFilter() 参数装饰器取出后与查询条件 AND 合并。
 */
export const DataScope = (options: DataScopeOptions = {}) =>
  SetMetadata(DATA_SCOPE_KEY, {
    deptField: options.deptField ?? 'deptId',
    ownerField: options.ownerField ?? 'createdBy',
  } satisfies ResolvedDataScopeOptions);
