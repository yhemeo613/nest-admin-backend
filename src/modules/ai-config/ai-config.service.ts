import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AiProtocol } from '@/infra/ai/ai.constants';
import { AiProviderRegistry } from '@/infra/ai/ai-provider.registry';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';

import {
  AiModelInputDto,
  ChatModelsResponseDto,
  CreateAiProviderDto,
  FetchModelsDto,
  UpdateAiProviderDto,
} from './dto/ai-config.dto';

/** 供应商视图：apiKey 只回传掩码，避免密钥泄漏到前端 */
export interface ProviderView {
  id: string;
  name: string;
  protocol: string;
  baseUrl: string;
  apiKey: string | null;
  remark: string | null;
  enabled: boolean;
  sort: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  models: {
    id: string;
    name: string;
    label: string | null;
    maxOutput: number | null;
    contextWindow: number | null;
    enabled: boolean;
    isDefault: boolean;
    sort: number;
  }[];
}

/**
 * AI 供应商/模型配置（参考 CC Switch）：
 * - 供应商 = 名称 + 协议格式 + 端点 + Key；模型 = ID + 最大输出 + 上下文窗口
 * - 模型列表随供应商整体替换；默认模型全局唯一
 * - 配置变更后失效注册表缓存，下一次调用即生效（无需重启）
 */
@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AiProviderRegistry,
  ) {}

  async list(): Promise<ProviderView[]> {
    const rows = await this.prisma.aiProvider.findMany({
      where: { deletedAt: null },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
      include: { models: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] } },
    });
    return rows.map((row) => this.toView(row));
  }

  async create(dto: CreateAiProviderDto, userId: string): Promise<ProviderView> {
    const created = await this.prisma.$transaction(async (tx) => {
      const provider = await tx.aiProvider.create({
        data: {
          name: dto.name,
          protocol: dto.protocol,
          baseUrl: this.normalizeBaseUrl(dto.baseUrl),
          apiKey: dto.apiKey || null,
          remark: dto.remark ?? null,
          enabled: dto.enabled ?? true,
          sort: dto.sort ?? 0,
          createdBy: userId,
        },
      });
      if (dto.models?.length) {
        await tx.aiModel.createMany({
          data: dto.models.map((m, index) => this.toModelData(provider.id, m, index)),
        });
        await this.enforceSingleDefault(tx, provider.id);
      }
      return provider;
    });
    this.registry.invalidate(created.id);
    this.logger.log(`新增供应商 ${created.name} (${created.id})`);
    return this.toView({ ...created, models: [] });
  }

  async update(id: string, dto: UpdateAiProviderDto): Promise<ProviderView> {
    const existing = await this.prisma.aiProvider.findFirst({
      where: { id, deletedAt: null },
      include: { models: true },
    });
    if (!existing) throw new BusinessException(ErrorCode.NOT_FOUND, '供应商不存在');

    // apiKey 缺省、空串、或原样回传掩码 → 保留数据库中的真实密钥
    const masked = this.maskApiKey(existing.apiKey);
    const apiKey = dto.apiKey && dto.apiKey !== masked ? dto.apiKey : existing.apiKey;

    await this.prisma.$transaction(async (tx) => {
      await tx.aiProvider.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.protocol !== undefined && { protocol: dto.protocol }),
          ...(dto.baseUrl !== undefined && { baseUrl: this.normalizeBaseUrl(dto.baseUrl) }),
          ...(dto.remark !== undefined && { remark: dto.remark }),
          ...(dto.enabled !== undefined && { enabled: dto.enabled }),
          ...(dto.sort !== undefined && { sort: dto.sort }),
          apiKey,
        },
      });
      if (dto.models !== undefined) {
        const keptIds = dto.models.map((m) => m.id).filter((v): v is string => Boolean(v));
        await tx.aiModel.deleteMany({ where: { providerId: id, id: { notIn: keptIds } } });
        for (const [index, model] of dto.models.entries()) {
          if (model.id) {
            await tx.aiModel.updateMany({
              where: { id: model.id, providerId: id },
              data: this.toModelData(id, model, index),
            });
          } else {
            await tx.aiModel.create({
              data: this.toModelData(id, model, index),
            });
          }
        }
        await this.enforceSingleDefault(tx, id);
      }
    });
    this.registry.invalidate(id);
    const updated = await this.prisma.aiProvider.findFirst({
      where: { id, deletedAt: null },
      include: { models: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] } },
    });
    return this.toView(updated!);
  }

  async remove(id: string): Promise<null> {
    const existing = await this.prisma.aiProvider.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new BusinessException(ErrorCode.NOT_FOUND, '供应商不存在');
    // 软删除：配置可恢复；其下模型随 provider 过滤一起失效
    await this.prisma.aiProvider.update({ where: { id }, data: { deletedAt: new Date() } });
    this.registry.invalidate(id);
    this.logger.log(`删除供应商 ${existing.name} (${id})`);
    return null;
  }

  /** 对话页模型选择器：所有启用模型 + 全局默认 */
  async listChatModels(): Promise<ChatModelsResponseDto> {
    const models = await this.prisma.aiModel.findMany({
      where: { enabled: true, provider: { enabled: true, deletedAt: null } },
      orderBy: [{ isDefault: 'desc' }, { provider: { sort: 'asc' } }, { sort: 'asc' }],
      include: { provider: { select: { name: true } } },
    });
    return {
      defaultModelId: models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? null,
      list: models.map((m) => ({
        id: m.id,
        name: m.name,
        label: m.label ?? m.name,
        providerName: m.provider.name,
        maxOutput: m.maxOutput,
        contextWindow: m.contextWindow,
        isDefault: m.isDefault,
      })),
    };
  }

  /** 从端点自动发现模型列表（参考 CC Switch「获取模型列表」） */
  async fetchRemoteModels(dto: FetchModelsDto): Promise<{ ids: string[] }> {
    const base = this.normalizeBaseUrl(dto.baseUrl);
    try {
      if (dto.protocol === AiProtocol.OLLAMA) {
        const res = await fetch(`${base}/api/tags`, {
          signal: AbortSignal.timeout(15_000),
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { models?: { name?: string }[] };
        return { ids: (json.models ?? []).map((m) => m.name ?? '').filter(Boolean) };
      }
      const res = await fetch(`${base}/models`, {
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: 'application/json',
          ...(dto.apiKey ? { Authorization: `Bearer ${dto.apiKey}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: { id?: string }[] };
      return { ids: (json.data ?? []).map((m) => m.id ?? '').filter(Boolean) };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`获取模型列表失败 ${base}: ${msg}`);
      throw new BusinessException(ErrorCode.AI_CALL_FAILED, `获取模型列表失败：${msg}`);
    }
  }

  /** 掩码 API Key：仅展示首尾，避免泄漏 */
  maskApiKey(key: string | null): string | null {
    if (!key) return null;
    if (key.length <= 8) return '******';
    return `${key.slice(0, 6)}***${key.slice(-4)}`;
  }

  private normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
  }

  private toModelData(providerId: string, model: AiModelInputDto, index: number) {
    return {
      providerId,
      name: model.name,
      label: model.label ?? null,
      maxOutput: model.maxOutput ?? null,
      contextWindow: model.contextWindow ?? null,
      enabled: model.enabled ?? true,
      isDefault: model.isDefault ?? false,
      sort: model.sort ?? index,
    };
  }

  /** 默认模型全局唯一：本供应商存在默认时，清掉其他供应商的默认标记 */
  private async enforceSingleDefault(tx: Prisma.TransactionClient, providerId: string) {
    const defaults = await tx.aiModel.findMany({
      where: { isDefault: true, providerId },
      select: { id: true },
    });
    if (!defaults.length) return;
    await tx.aiModel.updateMany({
      where: { isDefault: true, providerId: { not: providerId } },
      data: { isDefault: false },
    });
  }

  private toView(row: {
    id: string;
    name: string;
    protocol: string;
    baseUrl: string;
    apiKey: string | null;
    remark: string | null;
    enabled: boolean;
    sort: number;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    models: {
      id: string;
      name: string;
      label: string | null;
      maxOutput: number | null;
      contextWindow: number | null;
      enabled: boolean;
      isDefault: boolean;
      sort: number;
    }[];
  }): ProviderView {
    return {
      id: row.id,
      name: row.name,
      protocol: row.protocol,
      baseUrl: row.baseUrl,
      apiKey: this.maskApiKey(row.apiKey),
      remark: row.remark,
      enabled: row.enabled,
      sort: row.sort,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      models: row.models.map((m) => ({ ...m })),
    };
  }
}
