import { Injectable } from '@nestjs/common';
import { KbArticleStatus, Status } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';

import { KbArticleService } from '../kb-article.service';
import { HelpArticleCard } from './help-template.util';

/** C 端公开数据只取「租户启用 + 文章已发布」的最小字段集 */
const ARTICLE_CARD_SELECT = {
  title: true,
  slug: true,
  seoDescription: true,
  content: true,
  publishedAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: { name: true } } } },
} as const;

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articleService: KbArticleService,
  ) {}

  async findTenant(tenantCode: string) {
    return this.prisma.tenant.findFirst({
      where: { code: tenantCode, status: Status.ENABLED, deletedAt: null },
      select: { id: true, name: true, code: true },
    });
  }

  async homeCards(tenantId: string): Promise<HelpArticleCard[]> {
    const rows = await this.prisma.saasKbArticle.findMany({
      where: { tenantId, status: KbArticleStatus.PUBLISHED, deletedAt: null },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: ARTICLE_CARD_SELECT,
    });
    return rows.map((row) => ({
      title: row.title,
      slug: row.slug,
      seoDescription: row.seoDescription,
      preview: row.seoDescription ?? this.preview(row.content),
      publishedAt: row.publishedAt,
      tags: row.tags.map((t) => t.tag),
    }));
  }

  /** 文章（已发布才返回）；返回后异步累加浏览数 */
  async article(
    tenantId: string,
    slug: string,
  ): Promise<{
    title: string;
    slug: string;
    seoTitle: string | null;
    seoDescription: string | null;
    content: string;
    publishedAt: Date | null;
    updatedAt: Date;
    tags: { name: string }[];
    id: string;
  } | null> {
    const row = await this.prisma.saasKbArticle.findFirst({
      where: {
        tenantId,
        slug,
        status: KbArticleStatus.PUBLISHED,
        deletedAt: null,
      },
      select: { ...ARTICLE_CARD_SELECT, id: true, seoTitle: true },
    });
    if (!row) return null;
    void this.articleService.touchView(row.id);
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      content: row.content,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      tags: row.tags.map((t) => t.tag),
    };
  }

  async sitemapArticles(tenantId: string) {
    return this.prisma.saasKbArticle.findMany({
      where: { tenantId, status: KbArticleStatus.PUBLISHED, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: { slug: true, updatedAt: true },
    });
  }

  private preview(markdown: string, length = 160): string {
    const plain = markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*`~-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length > length ? `${plain.slice(0, length)}…` : plain;
  }
}
