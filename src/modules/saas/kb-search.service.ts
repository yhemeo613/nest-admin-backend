import { Injectable } from '@nestjs/common';
import { KbArticleStatus } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';

/** 检索命中结果（挂件问答注入 / 相关文章推荐共用） */
export interface KbSearchHit {
  id: string;
  title: string;
  slug: string;
  preview: string;
  score: number;
}

export interface KbSearchOptions {
  tenantId: string;
  /** 限定知识库（挂件可绑定单一库） */
  kbId?: string;
  limit?: number;
  /** 预览截断长度 */
  previewLength?: number;
}

/**
 * 知识库检索（P1 关键词方案）：
 * 中文按二字切片 + 英文整词 → ILIKE 候选召回 → JS 侧按命中加权打分（标题 > 正文）。
 * P2 升级 pgvector 语义检索时替换本实现，调用方（挂件问答注入）不感知。
 */
@Injectable()
export class KbSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string, opts: KbSearchOptions): Promise<KbSearchHit[]> {
    const terms = this.terms(query);
    if (!terms.length) return [];
    const limit = opts.limit ?? 3;

    const or = terms.flatMap((t) => [{ title: { contains: t } }, { content: { contains: t } }]);
    const rows = await this.prisma.saasKbArticle.findMany({
      where: {
        tenantId: opts.tenantId,
        status: KbArticleStatus.PUBLISHED,
        deletedAt: null,
        ...(opts.kbId ? { kbId: opts.kbId } : {}),
        OR: or,
      },
      select: { id: true, title: true, slug: true, content: true },
      // 候选集上限：避免大库全表拉回打分
      take: 60,
    });
    if (!rows.length) return [];

    const lower = query.toLowerCase();
    return rows
      .map((row) => {
        const title = row.title.toLowerCase();
        const content = row.content.toLowerCase();
        let score = 0;
        if (title.includes(lower)) score += 5;
        if (content.includes(lower)) score += 2;
        for (const t of terms) {
          if (title.includes(t)) score += 3;
          if (content.includes(t)) score += 1;
        }
        return {
          id: row.id,
          title: row.title,
          slug: row.slug,
          preview: this.preview(row.content, opts.previewLength ?? 800),
          score,
        };
      })
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** 中文重叠二字切片 + 英文/数字整词（上限 12 个检索词） */
  private terms(query: string): string[] {
    const parts = query.match(/[\u4e00-\u9fa5]+|[a-zA-Z0-9]+/g) ?? [];
    const out: string[] = [];
    for (const part of parts) {
      if (/^[a-zA-Z0-9]+$/.test(part)) {
        out.push(part);
        continue;
      }
      if (part.length <= 2) {
        out.push(part);
        continue;
      }
      // 步长 1 的重叠切片：怎么开发票呢 → 怎么/么开/开发/发票/票呢（避免跨边界漏词）
      for (let i = 0; i + 2 <= part.length && out.length < 12; i += 1) {
        out.push(part.slice(i, i + 2));
      }
    }
    return [...new Set(out)].slice(0, 12);
  }

  /** Markdown 轻量降噪后截断（仅作注入预览/推荐摘要） */
  private preview(markdown: string, length: number): string {
    const plain = markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*`~-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length > length ? `${plain.slice(0, length)}…` : plain;
  }
}
