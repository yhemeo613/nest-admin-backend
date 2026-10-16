import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { PermissionCode } from '@/shared/constants/permission-code';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { DataScope } from '@/shared/decorators/data-scope.decorator';
import { DataScopeFilter } from '@/shared/decorators/data-scope-filter.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { SkipWrap } from '@/shared/decorators/skip-wrap.decorator';
import { PageResult } from '@/shared/dto/pagination.dto';
import { AuthUser } from '@/shared/types/auth-user';

import {
  CreateTaskDto,
  FindingResponseDto,
  QueryFindingDto,
  QueryTaskDto,
  TaskResponseDto,
  TraceCallItemDto,
} from './dto/review-task.dto';
import { ReviewTaskService } from './review-task.service';

@ApiTags('代码评审-任务')
@ApiBearerAuth()
@Controller('review/tasks')
export class ReviewTaskController {
  constructor(private readonly taskService: ReviewTaskService) {}

  @Post()
  @RequirePermissions(PermissionCode.ReviewTaskCreate)
  @ApiOperation({ summary: '创建评审任务（入队执行）' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() operator: AuthUser): Promise<TaskResponseDto> {
    return this.taskService.create(dto, operator.userId);
  }

  @Get()
  @RequirePermissions(PermissionCode.ReviewTaskList)
  @DataScope({ ownerField: 'createdBy' })
  @ApiOperation({ summary: '任务分页列表（带数据权限）' })
  findAll(
    @Query() query: QueryTaskDto,
    @DataScopeFilter() scopeFilter: Record<string, unknown>,
  ): Promise<PageResult<TaskResponseDto>> {
    return this.taskService.findAll(query, scopeFilter);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.ReviewTaskDetail)
  @ApiOperation({ summary: '任务详情（状态/统计/红线结论）' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TaskResponseDto> {
    return this.taskService.findOne(id);
  }

  @Post(':id/cancel')
  @RequirePermissions(PermissionCode.ReviewTaskCancel)
  @ApiOperation({ summary: '取消任务（队列中移除 / 执行中 kill）' })
  async cancel(@Param('id', ParseUUIDPipe) id: string): Promise<null> {
    await this.taskService.cancel(id);
    return null;
  }

  @Post(':id/rerun')
  @RequirePermissions(PermissionCode.ReviewTaskRerun)
  @ApiOperation({ summary: '同参数重跑（创建新任务）' })
  rerun(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() operator: AuthUser,
  ): Promise<TaskResponseDto> {
    return this.taskService.rerun(id, operator.userId);
  }

  @Post(':id/publish')
  @RequirePermissions(PermissionCode.ReviewTaskPublish)
  @ApiOperation({ summary: '触发/重试 MR 回写' })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ noteUrl: string | null; inlineCount: number; inlineFailed: number }> {
    return this.taskService.publish(id);
  }

  @Get(':id/diff')
  @RequirePermissions(PermissionCode.ReviewTaskDetail)
  @SkipWrap()
  @ApiOperation({ summary: '任务 diff.patch（text/plain，前端 diff 渲染）' })
  async diff(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const content = await this.taskService.readDiff(id);
    res.type('text/plain; charset=utf-8').send(content);
  }

  @Get(':id/findings')
  @RequirePermissions(PermissionCode.ReviewTaskDetail)
  @ApiOperation({ summary: '任务发现列表（severity/category/status/isNew 筛选）' })
  findings(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryFindingDto,
  ): Promise<FindingResponseDto[]> {
    return this.taskService.findings(id, query);
  }

  @Get(':id/trace/calls')
  @RequirePermissions(PermissionCode.ReviewTaskDetail)
  @ApiOperation({ summary: '执行轨迹索引（每次 LLM 调用）' })
  traceCalls(@Param('id', ParseUUIDPipe) id: string): Promise<TraceCallItemDto[]> {
    return this.taskService.traceCalls(id);
  }

  @Get(':id/trace/call/:seq')
  @RequirePermissions(PermissionCode.ReviewTaskDetail)
  @ApiOperation({ summary: '单次调用完整记录（request/response/thinking，按 raw 偏移读取）' })
  traceCallDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seq', ParseIntPipe) seq: number,
  ): Promise<unknown> {
    return this.taskService.traceCallDetail(id, seq);
  }

  @Get(':id/manifest')
  @RequirePermissions(PermissionCode.ReviewTaskDetail)
  @ApiOperation({ summary: '覆盖率 manifest（每文件 reviewed/skipped/failed）' })
  manifest(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.taskService.readManifest(id);
  }

  @Get(':id/gate')
  @RequirePermissions(PermissionCode.ReviewTaskDetail)
  @ApiOperation({ summary: '红线结论（供 CI 查询）' })
  async gate(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    const task = await this.taskService.findOne(id);
    return { status: task.status, gateStatus: task.gateStatus, gateDetail: task.gateDetail };
  }
}
