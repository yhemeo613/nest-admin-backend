import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { PageResult, toPageResult, toSkipTake } from '@/shared/dto/pagination.dto';
import { BusinessException } from '@/shared/exceptions/business.exception';
import { AuthUser } from '@/shared/types/auth-user';

import { apiKeyPrefix, generateApiKey, hashApiKey } from './api-key.util';
import {
  ApiKeyView,
  CreateApiKeyDto,
  CreateTenantDto,
  QueryTenantDto,
  TenantView,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { dataScopeOf } from './scope.util';

/**
 * SaaS 租户运营：
 * - 租户 CRUD（软删除；删除时连带失效其下 API Key）
 * - 租户接入凭证管理（明文仅创建时返回一次，库中存 sha256）
 * 本模块是后续知识库/会话/计费等租户域数据的归属锚点。
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  async page(query: QueryTenantDto, user: AuthUser): Promise<PageResult<TenantView>> {
    // 租户管理员只看得到自己的租户（用于自助管理 API Key）
    const scope = dataScopeOf(user);
    const where = {
      deletedAt: null,
      ...(scope && { id: scope }),
      ...(query.keyword && {
        OR: [
          { name: { contains: query.keyword, mode: 'insensitive' as const } },
          { code: { contains: query.keyword, mode: 'insensitive' as const } },
        ],
      }),
      ...(query.status && { status: query.status }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
        include: {
          _count: {
            select: {
              apiKeys: { where: { deletedAt: null } },
              conversations: { where: { deletedAt: null } },
            },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return toPageResult(
      rows.map((row) => this.toView(row, row._count.conversations, row._count.apiKeys)),
      total,
      query,
    );
  }

  async create(dto: CreateTenantDto, userId: string): Promise<TenantView> {
    const exists = await this.prisma.tenant.findFirst({
      where: { code: dto.code, deletedAt: null },
      select: { id: true },
    });
    if (exists) throw new BusinessException(ErrorCode.TENANT_CODE_EXISTS);

    const created = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        code: dto.code,
        contactName: dto.contactName ?? null,
        contactEmail: dto.contactEmail ?? null,
        remark: dto.remark ?? null,
        createdBy: userId,
      },
    });
    this.logger.log(`新增租户 ${created.name} (${created.code})`);
    return this.toView(created, 0, 0);
  }

  async update(id: string, dto: UpdateTenantDto): Promise<TenantView> {
    const existing = await this.requireTenant(id);
    if (dto.code && dto.code !== existing.code) {
      const conflict = await this.prisma.tenant.findFirst({
        where: { code: dto.code, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (conflict) throw new BusinessException(ErrorCode.TENANT_CODE_EXISTS);
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.contactName !== undefined && { contactName: dto.contactName }),
        ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.remark !== undefined && { remark: dto.remark }),
      },
    });
    const counts = await this.countRelations(id);
    return this.toView(updated, counts.conversations, counts.apiKeys);
  }

  /** 软删除租户，连带失效其下全部 API Key（历史会话保留可追溯） */
  async remove(id: string): Promise<null> {
    await this.requireTenant(id);
    await this.prisma.$transaction([
      this.prisma.tenantApiKey.updateMany({
        where: { tenantId: id, deletedAt: null },
        data: { deletedAt: new Date(), status: 'DISABLED' },
      }),
      this.prisma.tenant.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    this.logger.log(`删除租户 ${id}（API Key 已连带失效）`);
    return null;
  }

  async listApiKeys(tenantId: string, user: AuthUser): Promise<ApiKeyView[]> {
    this.assertKeyScope(tenantId, dataScopeOf(user));
    await this.requireTenant(tenantId);
    const rows = await this.prisma.tenantApiKey.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toKeyView(row));
  }

  /** 创建 API Key：明文只返回这一次，之后无法再取回 */
  async createApiKey(
    tenantId: string,
    dto: CreateApiKeyDto,
    userId: string,
    user: AuthUser,
  ): Promise<ApiKeyView> {
    this.assertKeyScope(tenantId, dataScopeOf(user));
    const tenant = await this.requireTenant(tenantId);
    if (tenant.status !== 'ENABLED') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '租户已禁用，无法创建 API Key');
    }
    const plain = generateApiKey();
    const created = await this.prisma.tenantApiKey.create({
      data: {
        tenantId,
        name: dto.name,
        keyHash: hashApiKey(plain),
        keyPrefix: apiKeyPrefix(plain),
        createdBy: userId,
      },
    });
    this.logger.log(`为租户 ${tenant.code} 创建 API Key ${created.keyPrefix}`);
    return { ...this.toKeyView(created), plaintext: plain };
  }

  async removeApiKey(id: string, user: AuthUser): Promise<null> {
    const existing = await this.prisma.tenantApiKey.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new BusinessException(ErrorCode.API_KEY_NOT_FOUND);
    this.assertKeyScope(existing.tenantId, dataScopeOf(user));
    await this.prisma.tenantApiKey.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DISABLED' },
    });
    return null;
  }

  /** 租户管理员只能操作自己租户的 Key（越权按不存在处理） */
  private assertKeyScope(tenantId: string, scope: string | null): void {
    if (scope && tenantId !== scope) {
      throw new BusinessException(ErrorCode.API_KEY_NOT_FOUND);
    }
  }

  private async requireTenant(id: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) throw new BusinessException(ErrorCode.TENANT_NOT_FOUND);
    return tenant;
  }

  private async countRelations(
    tenantId: string,
  ): Promise<{ conversations: number; apiKeys: number }> {
    const [conversations, apiKeys] = await Promise.all([
      this.prisma.tenantConversation.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.tenantApiKey.count({ where: { tenantId, deletedAt: null } }),
    ]);
    return { conversations, apiKeys };
  }

  private toView(
    row: {
      id: string;
      name: string;
      code: string;
      contactName: string | null;
      contactEmail: string | null;
      status: 'ENABLED' | 'DISABLED';
      remark: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    conversationCount: number,
    apiKeyCount: number,
  ): TenantView {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      status: row.status,
      remark: row.remark,
      conversationCount,
      apiKeyCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toKeyView(row: {
    id: string;
    tenantId: string;
    name: string;
    keyPrefix: string;
    status: 'ENABLED' | 'DISABLED';
    lastUsedAt: Date | null;
    createdAt: Date;
  }): ApiKeyView {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      keyPrefix: row.keyPrefix,
      status: row.status,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    };
  }
}
