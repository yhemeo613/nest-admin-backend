import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '@/infra/prisma/prisma.service';

import { AiProtocol, OLLAMA_DEFAULT_BASE_URL } from './ai.constants';
import { ILlmProvider } from './providers/llm-provider.interface';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';

/** 数据库配置命中时的调用路由（provider 实例 + 解析出的模型与输出上限） */
export interface ResolvedRoute {
  provider: ILlmProvider;
  /** 实际命中的模型 ID（请求上游时使用） */
  model: string;
  /** 模型配置的 max_output，未配置则 undefined（走全局 AI_MAX_TOKENS） */
  maxTokens?: number;
}

interface CachedProvider {
  updatedAt: number;
  instance: ILlmProvider;
}

/**
 * 供应商注册表：把数据库里的 AiProvider/AiModel 配置解析成 ILlmProvider 实例。
 * - resolve()：按 modelId / 模型名 / 默认模型三级查找，未命中返回 null（调用方回落 env 配置）
 * - 实例按 provider.id + updatedAt 缓存，配置变更（invalidate）或热更新后重建
 */
@Injectable()
export class AiProviderRegistry {
  private readonly logger = new Logger(AiProviderRegistry.name);
  private readonly cache = new Map<string, CachedProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 解析调用路由。
   * 查找顺序：modelId → modelName 精确匹配 → 全局默认模型（isDefault）→ 任一启用模型。
   * 返回 null 表示数据库无可用配置，调用方应使用 env 注入的默认 Provider。
   */
  async resolve(modelId?: string, modelName?: string): Promise<ResolvedRoute | null> {
    const model = await this.findModel(modelId, modelName);
    if (!model) return null;
    return {
      provider: this.getProviderInstance(model.provider),
      model: model.name,
      maxTokens: model.maxOutput ?? undefined,
    };
  }

  /** 配置变更后清空实例缓存（providerId 省略时全清） */
  invalidate(providerId?: string): void {
    if (providerId) this.cache.delete(providerId);
    else this.cache.clear();
  }

  private findModel(modelId?: string, modelName?: string) {
    const relation = { provider: { deletedAt: null, enabled: true } };
    if (modelId) {
      return this.prisma.aiModel.findFirst({
        where: { id: modelId, enabled: true, ...relation },
        include: { provider: { include: { models: { orderBy: { sort: 'asc' } } } } },
      });
    }
    if (modelName) {
      return this.prisma.aiModel.findFirst({
        where: { name: modelName, enabled: true, ...relation },
        include: { provider: { include: { models: { orderBy: { sort: 'asc' } } } } },
      });
    }
    return this.prisma.aiModel.findFirst({
      where: { enabled: true, ...relation },
      orderBy: [{ isDefault: 'desc' }, { provider: { sort: 'asc' } }, { sort: 'asc' }],
      include: { provider: { include: { models: { orderBy: { sort: 'asc' } } } } },
    });
  }

  private getProviderInstance(row: {
    id: string;
    updatedAt: Date;
    name: string;
    protocol: string;
    baseUrl: string;
    apiKey: string | null;
    models: { name: string; enabled: boolean; isDefault: boolean; sort: number }[];
  }): ILlmProvider {
    const cached = this.cache.get(row.id);
    if (cached && cached.updatedAt === row.updatedAt.getTime()) {
      return cached.instance;
    }
    const instance = this.buildProvider(row);
    this.cache.set(row.id, { updatedAt: row.updatedAt.getTime(), instance });
    return instance;
  }

  private buildProvider(row: {
    id: string;
    name: string;
    protocol: string;
    baseUrl: string;
    apiKey: string | null;
    models: { name: string; enabled: boolean; isDefault: boolean; sort: number }[];
  }): ILlmProvider {
    const timeoutMs = this.config.get<number>('ai.timeoutMs', 60_000);
    const embeddingModel = this.config.get<string>('ai.embeddingModel', '') || undefined;
    const defaultModel =
      row.models.find((m) => m.enabled && m.isDefault)?.name ??
      row.models.find((m) => m.enabled)?.name ??
      this.config.get<string>('ai.model', '');

    if (row.protocol === AiProtocol.OLLAMA) {
      return new OllamaProvider({
        baseURL: row.baseUrl || OLLAMA_DEFAULT_BASE_URL,
        model: defaultModel,
        embeddingModel,
        timeoutMs,
      });
    }

    return new OpenAiCompatibleProvider({
      name: row.name,
      apiKey: row.apiKey ?? '',
      baseURL: row.baseUrl,
      model: defaultModel,
      embeddingModel,
      timeoutMs,
    });
  }
}
