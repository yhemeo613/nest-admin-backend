/**
 * 前后端共享契约（monorepo 单一事实来源）。
 * - PermissionCode：权限码常量，后端装饰器/seed 与前端 v-auth 共用
 * - ApiEnvelope / PaginatedResult：统一响应包与分页形状
 */

export * from './permission-code';
export * from './common';
