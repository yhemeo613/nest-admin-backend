import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Status } from '@prisma/client';

import { PermissionCode } from '@/shared/constants/permission-code';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { DataScope } from '@/shared/decorators/data-scope.decorator';
import { DataScopeFilter } from '@/shared/decorators/data-scope-filter.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { PageResult } from '@/shared/dto/pagination.dto';
import { AuthUser } from '@/shared/types/auth-user';

import { AssignRolesDto } from './dto/assign-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user.response.dto';
import { UserService } from './user.service';

@ApiTags('系统管理-用户')
@ApiBearerAuth()
@Controller('system/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermissions(PermissionCode.SystemUserList)
  @DataScope({ deptField: 'deptId', ownerField: 'createdBy' })
  @ApiOperation({ summary: '用户分页查询（带数据权限）' })
  findAll(
    @Query() query: QueryUserDto,
    @DataScopeFilter() scopeFilter: Record<string, unknown>,
  ): Promise<PageResult<UserResponseDto>> {
    return this.userService.findAll(query, scopeFilter);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.SystemUserList)
  @ApiOperation({ summary: '用户详情' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.userService.findOne(id);
  }

  @Post()
  @RequirePermissions(PermissionCode.SystemUserCreate)
  @ApiOperation({ summary: '新增用户' })
  create(@Body() dto: CreateUserDto, @CurrentUser() operator: AuthUser): Promise<UserResponseDto> {
    return this.userService.create(dto, operator.userId);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.SystemUserUpdate)
  @ApiOperation({ summary: '修改用户' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.SystemUserDelete)
  @ApiOperation({ summary: '删除用户（软删除）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<null> {
    await this.userService.remove(id);
    return null;
  }

  @Put(':id/roles')
  @RequirePermissions(PermissionCode.SystemUserAssignRoles)
  @ApiOperation({ summary: '分配角色（即时生效）' })
  async assignRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
  ): Promise<null> {
    await this.userService.assignRoles(id, dto);
    return null;
  }

  @Put(':id/password')
  @RequirePermissions(PermissionCode.SystemUserResetPassword)
  @ApiOperation({ summary: '重置密码（重置后强制重新登录）' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<null> {
    await this.userService.resetPassword(id, dto);
    return null;
  }

  @Patch(':id/status')
  @RequirePermissions(PermissionCode.SystemUserUpdate)
  @ApiOperation({ summary: '启用/禁用用户（禁用即踢下线）' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: Status,
  ): Promise<null> {
    await this.userService.updateStatus(id, status);
    return null;
  }
}
