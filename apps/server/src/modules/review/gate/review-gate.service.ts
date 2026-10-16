import { Injectable } from '@nestjs/common';
import { ReviewGateRule } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { CreateGateDto, GateResponseDto, UpdateGateDto } from './dto/review-gate.dto';

/** 评估输入：一次任务的发现严重级统计 */
export interface GateEvaluationInput {
  critical: number;
  high: number;
}

export interface GateEvaluationResult {
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  detail: {
    maxCritical: number | null;
    maxHigh: number | null;
    critical: number;
    high: number;
    reasons: string[];
  } | null;
}

@Injectable()
export class ReviewGateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateGateDto, operatorId?: string): Promise<GateResponseDto> {
    const repoId = dto.repoId ?? null;
    const exists = await this.prisma.reviewGateRule.findFirst({
      where: { repoId, deletedAt: null },
    });
    if (exists) throw new BusinessException(ErrorCode.REVIEW_GATE_CONFLICT);
    const rule = await this.prisma.reviewGateRule.create({
      data: {
        repoId,
        maxCritical: dto.maxCritical ?? null,
        maxHigh: dto.maxHigh ?? null,
        createdBy: operatorId,
      },
      include: { repo: { select: { name: true } } },
    });
    return this.toResponse(rule);
  }

  async update(id: string, dto: UpdateGateDto): Promise<GateResponseDto> {
    await this.ensureExists(id);
    const rule = await this.prisma.reviewGateRule.update({
      where: { id },
      data: {
        // undefined = 不修改；null = 清除
        ...(dto.maxCritical !== undefined && { maxCritical: dto.maxCritical }),
        ...(dto.maxHigh !== undefined && { maxHigh: dto.maxHigh }),
      },
      include: { repo: { select: { name: true } } },
    });
    return this.toResponse(rule);
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.reviewGateRule.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findAll(): Promise<GateResponseDto[]> {
    const rules = await this.prisma.reviewGateRule.findMany({
      where: { deletedAt: null },
      include: { repo: { select: { name: true } } },
      orderBy: [{ repoId: 'asc' }, { createdAt: 'desc' }],
    });
    return rules.map((r) => this.toResponse(r));
  }

  /** 任务评估用：仓库规则优先，回落全局默认；都无则 SKIPPED */
  async evaluate(repoId: string, input: GateEvaluationInput): Promise<GateEvaluationResult> {
    const rule =
      (await this.prisma.reviewGateRule.findFirst({
        where: { repoId, deletedAt: null },
      })) ??
      (await this.prisma.reviewGateRule.findFirst({
        where: { repoId: null, deletedAt: null },
      }));

    if (!rule) {
      return {
        status: 'SKIPPED',
        detail: { maxCritical: null, maxHigh: null, ...input, reasons: [] },
      };
    }

    const reasons: string[] = [];
    if (rule.maxCritical !== null && input.critical > rule.maxCritical) {
      reasons.push(`critical 问题 ${input.critical} 个，超过上限 ${rule.maxCritical}`);
    }
    if (rule.maxHigh !== null && input.high > rule.maxHigh) {
      reasons.push(`high 问题 ${input.high} 个，超过上限 ${rule.maxHigh}`);
    }

    return {
      status: reasons.length > 0 ? 'FAIL' : 'PASS',
      detail: {
        maxCritical: rule.maxCritical,
        maxHigh: rule.maxHigh,
        critical: input.critical,
        high: input.high,
        reasons,
      },
    };
  }

  private async ensureExists(id: string): Promise<ReviewGateRule> {
    const rule = await this.prisma.reviewGateRule.findFirst({
      where: { id, deletedAt: null },
    });
    if (!rule) throw new BusinessException(ErrorCode.REVIEW_GATE_RULE_NOT_FOUND);
    return rule;
  }

  private toResponse(rule: ReviewGateRule & { repo?: { name: string } | null }): GateResponseDto {
    return {
      id: rule.id,
      repoId: rule.repoId,
      repoName: rule.repo?.name ?? null,
      maxCritical: rule.maxCritical,
      maxHigh: rule.maxHigh,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }
}
