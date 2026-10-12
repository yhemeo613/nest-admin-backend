import { Module } from '@nestjs/common';

import { DeptModule } from './dept/dept.module';
import { PermissionModule } from './permission/permission.module';
import { RoleModule } from './role/role.module';
import { UserModule } from './user/user.module';

/** 权限中枢：用户 / 角色 / 权限点 / 部门统一管理 */
@Module({
  imports: [UserModule, RoleModule, PermissionModule, DeptModule],
})
export class SystemModule {}
