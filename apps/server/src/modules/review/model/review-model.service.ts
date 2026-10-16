import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ReviewModel, Status } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { PageResult, toPageResult, toSkipTake } from '@/shared/dto/pagination.dto';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { ReviewCryptoService } from '../shared/review-crypto.service';
import {
  CreateModelDto,
  ModelProtocol,
  ModelResponseDto,
  ModelTestResultDto,
  QueryModelDto,
  UpdateModelDto,
} from './dto/review-model.dto';

@Injectable()
export class ReviewModelService {
  private readonly logger = new Logger(ReviewModelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ReviewCryptoService,
  ) {}

  async create(dto: CreateModelDto, operatorId?: string): Promise<ModelResponseDto> {
    const model = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.reviewModel.updateMany({ data: { isDefault: false } });
      return tx.reviewModel.create({
        data: {
          name: dto.name,
          provider: dto.provider,
          protocol: dto.protocol,
          baseUrl: dto.baseUrl.replace(/\/+$/, ''),
          apiKeyEnc: this.crypto.encrypt(dto.apiKey),
          model: dto.model,
          extraBody: (dto.extraBody as Prisma.InputJsonValue) ?? undefined,
          isDefault: dto.isDefault ?? false,
          createdBy: operatorId,
        },
      });
    });
    this.logger.log(`新增模型配置: ${model.name}(${model.id})`);
    return this.toResponse(model);
  }

  async update(id: string, dto: UpdateModelDto): Promise<ModelResponseDto> {
    await this.ensureExists(id);
    const model = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.reviewModel.updateMany({ data: { isDefault: false } });
      return tx.reviewModel.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.provider !== undefined && { provider: dto.provider }),
          ...(dto.protocol !== undefined && { protocol: dto.protocol }),
          ...(dto.baseUrl !== undefined && { baseUrl: dto.baseUrl.replace(/\/+$/, '') }),
          ...(dto.apiKey !== undefined && { apiKeyEnc: this.crypto.encrypt(dto.apiKey) }),
          ...(dto.model !== undefined && { model: dto.model }),
          ...(dto.extraBody !== undefined && { extraBody: dto.extraBody as Prisma.InputJsonValue }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
          ...(dto.status !== undefined && { status: dto.status }),
        },
      });
    });
    return this.toResponse(model);
  }

  async remove(id: string): Promise<void> {
    const model = await this.ensureExists(id);
    const used = await this.prisma.reviewTask.count({
      where: { modelId: id, deletedAt: null, status: { in: ['PENDING', 'PREPARING', 'RUNNING'] } },
    });
    if (used > 0) throw new BusinessException(ErrorCode.CONFLICT, '存在进行中的评审任务引用该模型');
    if (model.isDefault)
      throw new BusinessException(ErrorCode.CONFLICT, '默认模型不可删除，请先切换默认');
    await this.prisma.reviewModel.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async findAll(query: QueryModelDto): Promise<PageResult<ModelResponseDto>> {
    const where: Prisma.ReviewModelWhereInput = {
      deletedAt: null,
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { model: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.reviewModel.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        ...toSkipTake(query),
      }),
      this.prisma.reviewModel.count({ where }),
    ]);
    return toPageResult(
      list.map((m) => this.toResponse(m)),
      total,
      query,
    );
  }

  /** 默认模型（创建任务未指定 modelId 时使用） */
  async getDefault(): Promise<ReviewModel | null> {
    return (
      (await this.prisma.reviewModel.findFirst({
        where: { deletedAt: null, status: Status.ENABLED, isDefault: true },
      })) ??
      (await this.prisma.reviewModel.findFirst({
        where: { deletedAt: null, status: Status.ENABLED },
        orderBy: { createdAt: 'asc' },
      }))
    );
  }

  /** 按 id 取可用模型（供任务执行器） */
  async getEnabled(id: string): Promise<ReviewModel> {
    const model = await this.prisma.reviewModel.findFirst({
      where: { id, deletedAt: null, status: Status.ENABLED },
    });
    if (!model) throw new BusinessException(ErrorCode.REVIEW_MODEL_NOT_FOUND);
    return model;
  }

  /** 解密模型 apiKey（任务执行器用；失败抛 REVIEW_CRYPTO_KEY_INVALID） */
  decryptApiKey(apiKeyEnc: string): string | null {
    return this.crypto.decrypt(apiKeyEnc);
  }

  /** 连通性测试：按协议发最小请求，验证 baseUrl/apiKey/model 可用 */
  async test(id?: string, dto?: CreateModelDto): Promise<ModelTestResultDto> {
    let target: { protocol: string; baseUrl: string; apiKey: string; model: string };
    if (id) {
      const model = await this.prisma.reviewModel.findFirst({
        where: { id, deletedAt: null },
      });
      if (!model) throw new BusinessException(ErrorCode.REVIEW_MODEL_NOT_FOUND);
      target = {
        protocol: model.protocol,
        baseUrl: model.baseUrl,
        apiKey: this.crypto.decrypt(model.apiKeyEnc) ?? '',
        model: model.model,
      };
    } else if (dto) {
      target = {
        protocol: dto.protocol,
        baseUrl: dto.baseUrl,
        apiKey: dto.apiKey,
        model: dto.model,
      };
    } else {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少模型参数');
    }
    return this.ping(target);
  }

  private async ping(t: {
    protocol: string;
    baseUrl: string;
    apiKey: string;
    model: string;
  }): Promise<ModelTestResultDto> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const isAnthropic = t.protocol === ModelProtocol.ANTHROPIC;
      const url = isAnthropic
        ? `${t.baseUrl.replace(/\/+$/, '')}/v1/messages`
        : `${t.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const headers: Record<string, string> = isAnthropic
        ? {
            'content-type': 'application/json',
            'x-api-key': t.apiKey,
            'anthropic-version': '2023-06-01',
          }
        : { 'content-type': 'application/json', authorization: `Bearer ${t.apiKey}` };
      const body = isAnthropic
        ? { model: t.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }
        : { model: t.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] };

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const text = (await res.text().catch(() => '')).slice(0, 300);
        return { ok: false, latencyMs, message: `HTTP ${res.status}: ${text}` };
      }
      return { ok: true, latencyMs, message: `连通正常（${latencyMs}ms）` };
    } catch (e) {
      const msg = (e as Error).name === 'AbortError' ? '请求超时（15s）' : (e as Error).message;
      return { ok: false, latencyMs: Date.now() - started, message: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureExists(id: string): Promise<ReviewModel> {
    const model = await this.prisma.reviewModel.findFirst({
      where: { id, deletedAt: null },
    });
    if (!model) throw new BusinessException(ErrorCode.REVIEW_MODEL_NOT_FOUND);
    return model;
  }

  private toResponse(model: ReviewModel): ModelResponseDto {
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      protocol: model.protocol,
      baseUrl: model.baseUrl,
      model: model.model,
      extraBody: (model.extraBody as Record<string, unknown> | null) ?? null,
      isDefault: model.isDefault,
      status: model.status,
      hasApiKey: Boolean(model.apiKeyEnc),
      createdBy: model.createdBy,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };
  }
}
