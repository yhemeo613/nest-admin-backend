import { Injectable, Logger } from '@nestjs/common';
import { KbArticleStatus } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { PageResult, toPageResult, toSkipTake } from '@/shared/dto/pagination.dto';
import { BusinessException } from '@/shared/exceptions/business.exception';
import { AuthUser } from '@/shared/types/auth-user';

import { CreateKbDto, CreateTagDto, KbView, QueryKbDto, TagView, UpdateKbDto } from './dto/kb.dto';
import { dataScopeOf } from './scope.util';

/**
 * 知识库管理：
 * - 平台视角全量；租户管理员（dataScopeOf 非空）被强制锁定在自己的租户内
 * - 知识库 CRUD（软删除）与库内标签管理（同库同名唯一）
 */
@Injectable()
export class KbService {
  private readonly logger = new Logger(KbService.name);

  constructor(private readonly prisma: PrismaService) {}

  async page(query: QueryKbDto, user: AuthUser): Promise<PageResult<KbView>> {
    const scope = dataScopeOf(user);
    const where = {
      deletedAt: null,
      tenantId: scope ?? query.tenantId ?? undefined,
      ...(query.keyword && { name: { contains: query.keyword } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.saasKb.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
        ...toSkipTake(query),
        include: {
          tenant: { select: { name: true } },
          _count: {
            select: {
              articles: { where: { deletedAt: null } },
            },
          },
        },
      }),
      this.prisma.saasKb.count({ where }),
    ]);

    // 已发布数单独统计
    const published = await this.prisma.saasKbArticle.groupBy({
      by: ['kbId'],
      where: {
        kbId: { in: rows.map((r) => r.id) },
        status: KbArticleStatus.PUBLISHED,
        deletedAt: null,
      },
      _count: { _all: true },
    });
    const publishedMap = new Map(published.map((p) => [p.kbId, p._count._all]));

    return toPageResult(
      rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenant.name,
        name: row.name,
        description: row.description,
        sort: row.sort,
        status: row.status,
        articleCount: row._count.articles,
        publishedCount: publishedMap.get(row.id) ?? 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      total,
      query,
    );
  }

  async create(dto: CreateKbDto, user: AuthUser): Promise<KbView> {
    const scope = dataScopeOf(user);
    // 租户管理员只能给自己租户建库；平台侧按入参建
    const tenantId = scope ?? dto.tenantId;
    if (!tenantId) throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择所属租户');
    if (scope && dto.tenantId && dto.tenantId !== scope) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '只能为自己的租户创建知识库');
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!tenant) throw new BusinessException(ErrorCode.TENANT_NOT_FOUND);

    const created = await this.prisma.saasKb.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        sort: dto.sort ?? 0,
      },
    });
    this.logger.log(`新增知识库 ${created.name} (${created.id}) 租户=${tenantId}`);
    return {
      id: created.id,
      tenantId,
      tenantName: tenant.name,
      name: created.name,
      description: created.description,
      sort: created.sort,
      status: created.status,
      articleCount: 0,
      publishedCount: 0,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async update(id: string, dto: UpdateKbDto, user: AuthUser): Promise<null> {
    await this.requireKb(id, dataScopeOf(user));
    await this.prisma.saasKb.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.sort !== undefined && { sort: dto.sort }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
    return null;
  }

  async remove(id: string, user: AuthUser): Promise<null> {
    await this.requireKb(id, dataScopeOf(user));
    await this.prisma.saasKb.update({ where: { id }, data: { deletedAt: new Date() } });
    this.logger.log(`删除知识库 ${id}`);
    return null;
  }

  // ==================== 标签 ====================

  async listTags(kbId: string, user: AuthUser): Promise<TagView[]> {
    await this.requireKb(kbId, dataScopeOf(user));
    const tags = await this.prisma.saasKbTag.findMany({
      where: { kbId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { articles: true } } },
    });
    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      articleCount: t._count.articles,
    }));
  }

  async createTag(kbId: string, dto: CreateTagDto, user: AuthUser): Promise<TagView> {
    const kb = await this.requireKb(kbId, dataScopeOf(user));
    const exists = await this.prisma.saasKbTag.findFirst({
      where: { kbId, name: dto.name },
      select: { id: true },
    });
    if (exists) throw new BusinessException(ErrorCode.CONFLICT, `标签「${dto.name}」已存在`);

    const tag = await this.prisma.saasKbTag.create({
      data: { kbId, tenantId: kb.tenantId, name: dto.name },
    });
    return { id: tag.id, name: tag.name, articleCount: 0 };
  }

  async removeTag(tagId: string, user: AuthUser): Promise<null> {
    const tag = await this.prisma.saasKbTag.findFirst({
      where: { id: tagId },
      select: { id: true, kbId: true },
    });
    if (!tag) throw new BusinessException(ErrorCode.NOT_FOUND, '标签不存在');
    await this.requireKb(tag.kbId, dataScopeOf(user));
    // 关联关系随 onDelete: Cascade 物理清除
    await this.prisma.saasKbTag.delete({ where: { id: tagId } });
    return null;
  }

  /** 带租户隔离的存在性校验：越权访问按「不存在」处理，不泄漏其他租户资源 */
  async requireKb(id: string, scope: string | null) {
    const kb = await this.prisma.saasKb.findFirst({ where: { id, deletedAt: null } });
    if (!kb || (scope && kb.tenantId !== scope)) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '知识库不存在');
    }
    return kb;
  }
}
