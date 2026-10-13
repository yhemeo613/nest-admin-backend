import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '@/infra/prisma/prisma.service';

import { AiProtocol, OLLAMA_DEFAULT_BASE_URL, PROVIDER_BASE_URLS } from './ai.constants';
import { MockChatModel } from './models/mock-chat.model';

/** 数据库/env 配置解析出的可调用模型（LangChain 原生实例） */
export interface ResolvedModel {
  /** LangChain 聊天模型（已配置具体模型 ID 与输出上限） */
  model: BaseChatModel;
  /** 实际命中的模型 ID（审计/回传用） */
  modelName: string;
  /** 厂商名（审计展示用） */
  providerName: string;
}

interface ModelRow {
  name: string;
  maxOutput: number | null;
  provider: {
    id: string;
    updatedAt: Date;
    name: string;
    protocol: string;
    baseUrl: string;
    apiKey: string | null;
  };
}

interface CachedModel {
  updatedAt: number;
  instance: BaseChatModel;
}

const PROVIDER_SELECT = {
  select: {
    id: true,
    updatedAt: true,
    name: true,
    protocol: true,
    baseUrl: true,
    apiKey: true,
  },
} as const;

/**
 * 模型注册表：把数据库 AiProvider/AiModel 配置或 env 配置解析为 LangChain 模型实例。
 * - resolve()：按 modelId / 模型名 / 默认模型三级查找，未命中返回 null（调用方回落 envDefault）
 * - 实例按 provider.id + updatedAt + 模型名 缓存；配置变更（invalidate）或热更新后重建
 * - maxRetries 统一为 0：重试/降级策略由 AiGateway 门面控制，避免双重重试
 */
@Injectable()
export class AiRegistry {
  private readonly cache = new Map<string, CachedModel>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** 解析数据库配置的模型。未命中返回 null 表示应回落 env 默认配置。 */
  async resolve(modelId?: string, modelName?: string): Promise<ResolvedModel | null> {
    const row = await this.findModel(modelId, modelName);
    if (!row) return null;
    return {
      model: this.getModelInstance(row),
      modelName: row.name,
      providerName: row.provider.name,
    };
  }

  /** env 默认配置（AI_PROVIDER/AI_MODEL 等）：数据库无配置时的兜底 */
  envDefault(): ResolvedModel {
    return this.envModel(this.config.get<string>('ai.model', 'gpt-4o-mini'));
  }

  /** env 备用模型（AI_FALLBACK_MODEL），未配置返回 null */
  envFallback(): ResolvedModel | null {
    const fallback = this.config.get<string>('ai.fallbackModel', '');
    if (!fallback) return null;
    return this.envModel(fallback);
  }

  /** 按 env 协议配置构造指定模型的实例（主/备用共用） */
  private envModel(model: string): ResolvedModel {
    const providerKey = this.config.get<string>('ai.provider', 'mock');
    const baseUrl = this.config.get<string>('ai.baseUrl', '');
    const timeoutMs = this.config.get<number>('ai.timeoutMs', 60_000);

    if (providerKey === 'mock') {
      return { model: new MockChatModel(model), modelName: model, providerName: 'mock' };
    }
    if (providerKey === 'ollama') {
      return {
        model: new ChatOllama({
          baseUrl: baseUrl || OLLAMA_DEFAULT_BASE_URL,
          model,
          maxRetries: 0,
        }),
        modelName: model,
        providerName: 'ollama',
      };
    }
    return {
      model: new ChatOpenAI({
        model,
        apiKey: this.config.get<string>('ai.apiKey', ''),
        configuration: {
          baseURL: baseUrl || PROVIDER_BASE_URLS[providerKey] || PROVIDER_BASE_URLS.openai,
        },
        timeout: timeoutMs,
        maxRetries: 0,
      }),
      modelName: model,
      providerName: providerKey,
    };
  }

  /** 向量化模型（RAG 摄取/检索；env 配置驱动，部分厂商不可用时调用方兜底） */
  embeddings(): OpenAIEmbeddings {
    const baseUrl =
      this.config.get<string>('ai.baseUrl', '') ||
      PROVIDER_BASE_URLS[this.config.get<string>('ai.provider', 'openai')] ||
      PROVIDER_BASE_URLS.openai;
    return new OpenAIEmbeddings({
      model: this.config.get<string>('ai.embeddingModel', '') || 'text-embedding-3-small',
      apiKey: this.config.get<string>('ai.apiKey', ''),
      configuration: { baseURL: baseUrl },
      maxRetries: 0,
    });
  }

  /** 配置变更后清空实例缓存（providerId 省略时全清） */
  invalidate(providerId?: string): void {
    if (!providerId) {
      this.cache.clear();
      return;
    }
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(`${providerId}:`)) this.cache.delete(key);
    }
  }

  private findModel(modelId?: string, modelName?: string) {
    const relation = { provider: { deletedAt: null, enabled: true } };
    if (modelId) {
      return this.prisma.aiModel.findFirst({
        where: { id: modelId, enabled: true, ...relation },
        select: { name: true, maxOutput: true, provider: PROVIDER_SELECT },
      });
    }
    if (modelName) {
      return this.prisma.aiModel.findFirst({
        where: { name: modelName, enabled: true, ...relation },
        select: { name: true, maxOutput: true, provider: PROVIDER_SELECT },
      });
    }
    return this.prisma.aiModel.findFirst({
      where: { enabled: true, ...relation },
      orderBy: [{ isDefault: 'desc' }, { provider: { sort: 'asc' } }, { sort: 'asc' }],
      select: { name: true, maxOutput: true, provider: PROVIDER_SELECT },
    });
  }

  private getModelInstance(row: ModelRow): BaseChatModel {
    const cacheKey = `${row.provider.id}:${row.provider.updatedAt.getTime()}:${row.name}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached.instance;
    const instance = this.buildModel(row);
    this.cache.set(cacheKey, { updatedAt: row.provider.updatedAt.getTime(), instance });
    return instance;
  }

  private buildModel(row: ModelRow): BaseChatModel {
    const timeoutMs = this.config.get<number>('ai.timeoutMs', 60_000);
    if (row.provider.protocol === AiProtocol.OLLAMA) {
      return new ChatOllama({
        baseUrl: row.provider.baseUrl || OLLAMA_DEFAULT_BASE_URL,
        model: row.name,
        maxRetries: 0,
      });
    }
    return new ChatOpenAI({
      model: row.name,
      apiKey: row.provider.apiKey ?? '',
      configuration: { baseURL: row.provider.baseUrl },
      timeout: timeoutMs,
      maxRetries: 0,
      ...(row.maxOutput ? { max_tokens: row.maxOutput } : {}),
    });
  }
}
