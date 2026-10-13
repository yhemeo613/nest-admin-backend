import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { PageResult } from '@/shared/dto/pagination.dto';
import { AuthUser } from '@/shared/types/auth-user';

import {
  ArticleDetailView,
  ArticleView,
  CreateKbDto,
  CreateTagDto,
  KbView,
  QueryArticleDto,
  QueryKbDto,
  SaveArticleDto,
  TagView,
  UpdateKbDto,
} from './dto/kb.dto';
import { KbService } from './kb.service';
import { KbArticleService } from './kb-article.service';

@ApiTags('SaaS 知识库')
@ApiBearerAuth()
@Controller('saas/kbs')
export class KbController {
  constructor(
    private readonly kbService: KbService,
    private readonly articleService: KbArticleService,
  ) {}

  // ==================== 知识库 ====================

  @Get()
  @RequirePermissions(PermissionCode.SaasKbList)
  @ApiOperation({ summary: '知识库分页列表（租户管理员强制只看自己的库）' })
  page(@Query() query: QueryKbDto, @CurrentUser() user: AuthUser): Promise<PageResult<KbView>> {
    return this.kbService.page(query, user);
  }

  @Post()
  @RequirePermissions(PermissionCode.SaasKbCreate)
  @ApiOperation({ summary: '新增知识库（租户管理员只能给自己的租户建库）' })
  create(@Body() dto: CreateKbDto, @CurrentUser() user: AuthUser): Promise<KbView> {
    return this.kbService.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.SaasKbUpdate)
  @ApiOperation({ summary: '修改知识库' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKbDto,
    @CurrentUser() user: AuthUser,
  ): Promise<null> {
    return this.kbService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.SaasKbDelete)
  @ApiOperation({ summary: '删除知识库（软删除）' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<null> {
    return this.kbService.remove(id, user);
  }

  // ==================== 文章 ====================

  @Get(':id/articles')
  @RequirePermissions(PermissionCode.SaasKbArticleList)
  @ApiOperation({ summary: '库内文章分页列表（keyword/status/tagId 过滤）' })
  pageArticles(
    @Param('id') id: string,
    @Query() query: QueryArticleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PageResult<ArticleView>> {
    return this.articleService.page(id, query, user);
  }

  @Post(':id/articles')
  @RequirePermissions(PermissionCode.SaasKbArticleCreate)
  @ApiOperation({ summary: '新增文章（可带标签；发布记发布时间）' })
  createArticle(
    @Param('id') id: string,
    @Body() dto: SaveArticleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleView> {
    return this.articleService.create(id, dto, user);
  }

  @Get('articles/:articleId')
  @RequirePermissions(PermissionCode.SaasKbArticleList)
  @ApiOperation({ summary: '文章详情（含正文）' })
  articleDetail(
    @Param('articleId') articleId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleDetailView> {
    return this.articleService.detail(articleId, user);
  }

  @Put('articles/:articleId')
  @RequirePermissions(PermissionCode.SaasKbArticleUpdate)
  @ApiOperation({ summary: '修改文章（标签整体替换）' })
  updateArticle(
    @Param('articleId') articleId: string,
    @Body() dto: SaveArticleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ArticleView> {
    return this.articleService.update(articleId, dto, user);
  }

  @Delete('articles/:articleId')
  @RequirePermissions(PermissionCode.SaasKbArticleDelete)
  @ApiOperation({ summary: '删除文章（软删除并归档）' })
  removeArticle(
    @Param('articleId') articleId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<null> {
    return this.articleService.remove(articleId, user);
  }

  // ==================== 标签 ====================

  @Get(':id/tags')
  @RequirePermissions(PermissionCode.SaasKbTagList)
  @ApiOperation({ summary: '库内标签列表（含引用文章数）' })
  listTags(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<TagView[]> {
    return this.kbService.listTags(id, user);
  }

  @Post(':id/tags')
  @RequirePermissions(PermissionCode.SaasKbTagCreate)
  @ApiOperation({ summary: '新增标签（同库同名唯一）' })
  createTag(
    @Param('id') id: string,
    @Body() dto: CreateTagDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TagView> {
    return this.kbService.createTag(id, dto, user);
  }

  @Delete('tags/:tagId')
  @RequirePermissions(PermissionCode.SaasKbTagDelete)
  @ApiOperation({ summary: '删除标签（解除全部文章关联）' })
  removeTag(@Param('tagId') tagId: string, @CurrentUser() user: AuthUser): Promise<null> {
    return this.kbService.removeTag(tagId, user);
  }
}
