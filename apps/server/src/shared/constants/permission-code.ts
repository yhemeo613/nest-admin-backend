/**
 * 权限码常量：唯一事实来源已提升至 packages/contracts（前后端同源）。
 * 本文件仅做 re-export，保持后端既有 `@/shared/constants/permission-code` 引用路径不变。
 * 新增权限码需同步 apps/server/prisma/seed.ts 的 PERMISSION_TREE 并重新执行 prisma:seed。
 */
export { PermissionCode, type PermissionCodeValue } from '@nestperm/contracts';
