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

import { CreateRepoDto, QueryRepoDto, RepoResponseDto, UpdateRepoDto } from './dto/review-repo.dto';
import { ReviewRepoService } from './review-repo.service';

@ApiTags('代码评审-仓库')
@ApiBearerAuth()
@Controller('review/repos')
export class ReviewRepoController {
  constructor(private readonly repoService: ReviewRepoService) {}

  @Get()
  @RequirePermissions(PermissionCode.ReviewRepoList)
  @ApiOperation({ summary: '仓库分页列表' })
  findAll(@Query() query: QueryRepoDto): Promise<PageResult<RepoResponseDto>> {
    return this.repoService.findAll(query);
  }

  @Post()
  @RequirePermissions(PermissionCode.ReviewRepoCreate)
  @ApiOperation({ summary: '登记仓库（凭证加密存储）' })
  create(@Body() dto: CreateRepoDto, @CurrentUser() operator: AuthUser): Promise<RepoResponseDto> {
    return this.repoService.create(dto, operator.userId);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.ReviewRepoEdit)
  @ApiOperation({ summary: '修改仓库' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRepoDto,
  ): Promise<RepoResponseDto> {
    return this.repoService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.ReviewRepoDelete)
  @ApiOperation({ summary: '删除仓库（软删除 + 清理工作区）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<null> {
    await this.repoService.remove(id);
    return null;
  }

  @Post(':id/sync')
  @RequirePermissions(PermissionCode.ReviewRepoSync)
  @ApiOperation({ summary: '同步工作区（clone/fetch）' })
  sync(@Param('id', ParseUUIDPipe) id: string): Promise<RepoResponseDto> {
    return this.repoService.sync(id);
  }
}
