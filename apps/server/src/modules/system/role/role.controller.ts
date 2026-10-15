import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { PageResult } from '@/shared/dto/pagination.dto';

import {
  AssignPermissionsDto,
  CreateRoleDto,
  QueryRoleDto,
  RoleResponseDto,
  SetDataScopeDto,
  UpdateRoleDto,
} from './dto/role.dto';
import { RoleService } from './role.service';

@ApiTags('系统管理-角色')
@ApiBearerAuth()
@Controller('system/roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermissions(PermissionCode.SystemRoleList)
  @ApiOperation({ summary: '角色分页查询' })
  findAll(@Query() query: QueryRoleDto): Promise<PageResult<RoleResponseDto>> {
    return this.roleService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.SystemRoleList)
  @ApiOperation({ summary: '角色详情' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<RoleResponseDto> {
    return this.roleService.findOne(id);
  }

  @Post()
  @RequirePermissions(PermissionCode.SystemRoleCreate)
  @ApiOperation({ summary: '新增角色' })
  create(@Body() dto: CreateRoleDto): Promise<RoleResponseDto> {
    return this.roleService.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.SystemRoleUpdate)
  @ApiOperation({ summary: '修改角色' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.SystemRoleDelete)
  @ApiOperation({ summary: '删除角色（已分配用户时拒绝）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<null> {
    await this.roleService.remove(id);
    return null;
  }

  @Put(':id/permissions')
  @RequirePermissions(PermissionCode.SystemRoleAssignPerms)
  @ApiOperation({ summary: '分配权限点（即时生效）' })
  async assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
  ): Promise<null> {
    await this.roleService.assignPermissions(id, dto);
    return null;
  }

  @Put(':id/data-scope')
  @RequirePermissions(PermissionCode.SystemRoleAssignPerms)
  @ApiOperation({ summary: '配置数据权限范围' })
  async setDataScope(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDataScopeDto,
  ): Promise<null> {
    await this.roleService.setDataScope(id, dto);
    return null;
  }
}
