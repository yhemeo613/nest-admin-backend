import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { AuthUser } from '@/shared/types/auth-user';

import { CreateGateDto, GateResponseDto, UpdateGateDto } from './dto/review-gate.dto';
import { ReviewGateService } from './review-gate.service';

@ApiTags('代码评审-质量红线')
@ApiBearerAuth()
@Controller('review/gates')
export class ReviewGateController {
  constructor(private readonly gateService: ReviewGateService) {}

  @Get()
  @RequirePermissions(PermissionCode.ReviewGateList)
  @ApiOperation({ summary: '红线规则列表（全局 + 按仓库）' })
  findAll(): Promise<GateResponseDto[]> {
    return this.gateService.findAll();
  }

  @Post()
  @RequirePermissions(PermissionCode.ReviewGateEdit)
  @ApiOperation({ summary: '新增红线规则（同作用域唯一）' })
  create(@Body() dto: CreateGateDto, @CurrentUser() operator: AuthUser): Promise<GateResponseDto> {
    return this.gateService.create(dto, operator.userId);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.ReviewGateEdit)
  @ApiOperation({ summary: '修改红线规则（null 清除限制）' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGateDto,
  ): Promise<GateResponseDto> {
    return this.gateService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.ReviewGateEdit)
  @ApiOperation({ summary: '删除红线规则（软删除）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<null> {
    await this.gateService.remove(id);
    return null;
  }
}
