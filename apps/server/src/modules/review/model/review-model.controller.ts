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
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { PageResult } from '@/shared/dto/pagination.dto';
import { AuthUser } from '@/shared/types/auth-user';

import {
  CreateModelDto,
  ModelResponseDto,
  ModelTestResultDto,
  QueryModelDto,
  UpdateModelDto,
} from './dto/review-model.dto';
import { ReviewModelService } from './review-model.service';

@ApiTags('代码评审-模型配置')
@ApiBearerAuth()
@Controller('review/models')
export class ReviewModelController {
  constructor(private readonly modelService: ReviewModelService) {}

  @Get()
  @RequirePermissions(PermissionCode.ReviewModelList)
  @ApiOperation({ summary: '模型配置分页列表' })
  findAll(@Query() query: QueryModelDto): Promise<PageResult<ModelResponseDto>> {
    return this.modelService.findAll(query);
  }

  @Post()
  @RequirePermissions(PermissionCode.ReviewModelCreate)
  @ApiOperation({ summary: '新增模型配置（apiKey 加密存储）' })
  create(
    @Body() dto: CreateModelDto,
    @CurrentUser() operator: AuthUser,
  ): Promise<ModelResponseDto> {
    return this.modelService.create(dto, operator.userId);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.ReviewModelEdit)
  @ApiOperation({ summary: '修改模型配置' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateModelDto,
  ): Promise<ModelResponseDto> {
    return this.modelService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.ReviewModelDelete)
  @ApiOperation({ summary: '删除模型配置（软删除）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<null> {
    await this.modelService.remove(id);
    return null;
  }

  @Post(':id/test')
  @RequirePermissions(PermissionCode.ReviewModelTest)
  @ApiOperation({ summary: '连通性测试（已保存配置）' })
  test(@Param('id', ParseUUIDPipe) id: string): Promise<ModelTestResultDto> {
    return this.modelService.test(id);
  }

  @Post('test')
  @RequirePermissions(PermissionCode.ReviewModelTest)
  @ApiOperation({ summary: '连通性测试（表单未保存参数）' })
  testDraft(@Body() dto: CreateModelDto): Promise<ModelTestResultDto> {
    return this.modelService.test(undefined, dto);
  }
}
