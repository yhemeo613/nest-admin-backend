import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';

import { DeptService } from './dept.service';
import { CreateDeptDto, DeptNodeDto, UpdateDeptDto } from './dto/dept.dto';

@ApiTags('系统管理-部门')
@ApiBearerAuth()
@Controller('system/depts')
export class DeptController {
  constructor(private readonly deptService: DeptService) {}

  @Get('tree')
  @RequirePermissions(PermissionCode.SystemDeptList)
  @ApiOperation({ summary: '部门树' })
  tree(): Promise<DeptNodeDto[]> {
    return this.deptService.tree();
  }

  @Post()
  @RequirePermissions(PermissionCode.SystemDeptCreate)
  @ApiOperation({ summary: '新增部门' })
  create(@Body() dto: CreateDeptDto): Promise<DeptNodeDto> {
    return this.deptService.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.SystemDeptUpdate)
  @ApiOperation({ summary: '修改部门（支持移动子树）' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeptDto): Promise<DeptNodeDto> {
    return this.deptService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.SystemDeptDelete)
  @ApiOperation({ summary: '删除部门（有子级或用户时拒绝）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<null> {
    await this.deptService.remove(id);
    return null;
  }
}
