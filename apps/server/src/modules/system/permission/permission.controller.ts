import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';

import { CreatePermissionDto, PermissionNodeDto, UpdatePermissionDto } from './dto/permission.dto';
import { PermissionService } from './permission.service';

@ApiTags('系统管理-权限点')
@ApiBearerAuth()
@Controller('system/permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get('tree')
  @RequirePermissions(PermissionCode.SystemPermissionList)
  @ApiOperation({ summary: '权限树' })
  tree(): Promise<PermissionNodeDto[]> {
    return this.permissionService.tree();
  }

  @Post()
  @RequirePermissions(PermissionCode.SystemPermissionCreate)
  @ApiOperation({ summary: '新增权限点' })
  create(@Body() dto: CreatePermissionDto): Promise<PermissionNodeDto> {
    return this.permissionService.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.SystemPermissionUpdate)
  @ApiOperation({ summary: '修改权限点' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionDto,
  ): Promise<PermissionNodeDto> {
    return this.permissionService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.SystemPermissionDelete)
  @ApiOperation({ summary: '删除权限点（有子级或被角色引用时拒绝）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<null> {
    await this.permissionService.remove(id);
    return null;
  }
}
