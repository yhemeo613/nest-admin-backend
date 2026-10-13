import { Injectable, Logger } from '@nestjs/common';
import { KbArticleStatus, Prisma } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { PageResult, toPageResult, toSkipTake } from '@/shared/dto/pagination.dto';
import { BusinessException } from '@/shared/exceptions/business.exception';
import { AuthUser } from '@/shared/types/auth-user';

import { ArticleDetailView, ArticleView, QueryArticleDto, SaveArticleDto } from './dto/kb.dto';
import { KbService } from './kb.service';
import { dataScopeOf } from './scope.util';

const ARTICLE_SELECT = {
  id: true,
  kbId: true,
  tenantId: true,
  title: true,
  slug: true,
  status: true,
  seoTitle: true,
  seoDescription: true,
  publishedAt: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: { id: true, name: true } } } },
} satisfies Prisma.SaasKbArticleSelect;

type ArticleRow = Prisma.SaasKbArticleGetPayload<{ select: typeof ARTICLE_SELECT }>;

/**
 * 知识库文章：CRUD + 发布状态机（DRAFT → PUBLISHED 记发布时间）+ 标签挂接。
 * slug 同库唯一（@@unique([kbId, slug])），冲突映射为 CONFLICT 错误码。
 */
@Injectable()
export class KbArticleService {
  private readonly logger = new Logger(KbArticleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kbService: KbService,
  ) {}

  async page(
    kbId: string,
    query: QueryArticleDto,
    user: AuthUser,
  ): Promise<PageResult<ArticleView>> {
    await this.kbService.requireKb(kbId, dataScopeOf(user));
    const where = {
      kbId,
      deletedAt: null,
      ...(query.keyword && { title: { contains: query.keyword } }),
      ...(query.status && { status: query.status }),
      ...(query.tagId && { tags: { some: { tagId: query.tagId } } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.saasKbArticle.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        ...toSkipTake(query),
        select: ARTICLE_SELECT,
      }),
      this.prisma.saasKbArticle.count({ where }),
    ]);
    return toPageResult(
      rows.map((row) => this.toView(row)),
      total,
      query,
    );
  }

  async detail(id: string, user: AuthUser): Promise<ArticleDetailView> {
    const row = await this.prisma.saasKbArticle.findFirst({
      where: { id, deletedAt: null },
      select: { ...ARTICLE_SELECT, content: true, kbId: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在');
    await this.kbService.requireKb(row.kbId, dataScopeOf(user));
    return { ...this.toView(row), content: row.content };
  }

  async create(kbId: string, dto: SaveArticleDto, user: AuthUser): Promise<ArticleView> {
    const kb = await this.kbService.requireKb(kbId, dataScopeOf(user));
    await this.assertSlugUnique(kbId, dto.slug);

    const tagIds = this.cleanTagIds(dto.tagIds);
    const created = await this.prisma.saasKbArticle.create({
      data: {
        kbId,
        tenantId: kb.tenantId,
        title: dto.title,
        slug: dto.slug,
        content: dto.content,
        status: dto.status ?? KbArticleStatus.DRAFT,
        seoTitle: dto.seoTitle ?? null,
        seoDescription: dto.seoDescription ?? null,
        publishedAt: dto.status === 'PUBLISHED' ? new Date() : null,
        ...(tagIds.length ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } } : {}),
      },
      select: ARTICLE_SELECT,
    });
    this.logger.log(`新增文章 ${created.title} (${created.slug}) 库=${kbId}`);
    return this.toView(created);
  }

  async update(id: string, dto: SaveArticleDto, user: AuthUser): Promise<ArticleView> {
    const existing = await this.prisma.saasKbArticle.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, kbId: true, status: true },
    });
    if (!existing) throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在');
    await this.kbService.requireKb(existing.kbId, dataScopeOf(user));
    if (dto.slug !== undefined) await this.assertSlugUnique(existing.kbId, dto.slug, id);

    const nextStatus = dto.status ?? existing.status;
    // 发布时间：首次发布时记录；已发布文章编辑不重置
    const publishedAt =
      nextStatus === KbArticleStatus.PUBLISHED
        ? existing.status === KbArticleStatus.PUBLISHED
          ? undefined
          : new Date()
        : null;

    const tagIds = dto.tagIds !== undefined ? this.cleanTagIds(dto.tagIds) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (tagIds) {
        await tx.saasKbArticleTag.deleteMany({ where: { articleId: id } });
        if (tagIds.length) {
          await tx.saasKbArticleTag.createMany({
            data: tagIds.map((tagId) => ({ articleId: id, tagId })),
          });
        }
      }
      return tx.saasKbArticle.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.slug !== undefined && { slug: dto.slug }),
          ...(dto.content !== undefined && { content: dto.content }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.seoTitle !== undefined && { seoTitle: dto.seoTitle }),
          ...(dto.seoDescription !== undefined && { seoDescription: dto.seoDescription }),
          ...(publishedAt !== undefined && { publishedAt }),
        },
        select: ARTICLE_SELECT,
      });
    });
    return this.toView(updated);
  }

  async remove(id: string, user: AuthUser): Promise<null> {
    const existing = await this.prisma.saasKbArticle.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, kbId: true },
    });
    if (!existing) throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在');
    await this.kbService.requireKb(existing.kbId, dataScopeOf(user));
    await this.prisma.saasKbArticle.update({
      where: { id },
      data: { deletedAt: new Date(), status: KbArticleStatus.ARCHIVED },
    });
    return null;
  }

  /** SEO 页浏览计数（公开页调用，失败不影响展示） */
  async touchView(id: string): Promise<void> {
    await this.prisma.saasKbArticle
      .updateMany({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);
  }

  private async assertSlugUnique(kbId: string, slug: string, excludeId?: string) {
    const conflict = await this.prisma.saasKbArticle.findFirst({
      where: { kbId, slug, deletedAt: null, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true },
    });
    if (conflict) throw new BusinessException(ErrorCode.CONFLICT, `slug「${slug}」在该库中已存在`);
  }

  private cleanTagIds(tagIds?: string[]): string[] {
    return [...new Set((tagIds ?? []).filter((t) => typeof t === 'string' && t))];
  }

  private toView(row: ArticleRow): ArticleView {
    return {
      id: row.id,
      kbId: row.kbId,
      tenantId: row.tenantId,
      title: row.title,
      slug: row.slug,
      status: row.status,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      publishedAt: row.publishedAt,
      viewCount: row.viewCount,
      tags: row.tags.map((t) => t.tag),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
