import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ReviewGateStatus, ReviewRepo, ReviewTask, ReviewTaskStatus } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { PageResult, toPageResult, toSkipTake } from '@/shared/dto/pagination.dto';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { GateEvaluationResult } from '../gate/review-gate.service';
import { MrIntegrationService, parseMrUrl } from '../integrations/mr-integration.service';
import { ReviewModelService } from '../model/review-model.service';
import { ReviewRepoService } from '../repo/review-repo.service';
import { ReviewCryptoService } from '../shared/review-crypto.service';
import {
  CreateTaskDto,
  FindingResponseDto,
  QueryFindingDto,
  QueryTaskDto,
  TaskResponseDto,
} from './dto/review-task.dto';
import { OcrExecutorService } from './executors/ocr-executor.service';
import { OcrManifest, OcrResultJson } from './parsers/ocr-types';
import { ReviewEventsService } from './review-events.service';
import { ReviewQueueService } from './review-queue.service';

const TERMINAL: ReviewTaskStatus[] = ['SUCCESS', 'FAILED', 'CANCELLED'];

@Injectable()
export class ReviewTaskService {
  private readonly logger = new Logger(ReviewTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ReviewQueueService,
    private readonly repoService: ReviewRepoService,
    private readonly modelService: ReviewModelService,
    private readonly mrIntegration: MrIntegrationService,
    private readonly crypto: ReviewCryptoService,
    private readonly executor: OcrExecutorService,
    private readonly events: ReviewEventsService,
  ) {}

  /** 创建并入队 */
  async create(dto: CreateTaskDto, operatorId?: string): Promise<TaskResponseDto> {
    const repo = await this.repoService.getForRun(dto.repoId);
    if (dto.modelId) await this.modelService.getEnabled(dto.modelId);
    else {
      const def = await this.modelService.getDefault();
      if (!def) throw new BusinessException(ErrorCode.BAD_REQUEST, '请先配置至少一个模型');
    }

    if (dto.mode === 'RANGE' && !dto.fromRef) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, 'RANGE 模式需要 fromRef');
    }
    if (dto.mode === 'COMMIT' && !dto.commitSha) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, 'COMMIT 模式需要 commitSha');
    }
    if (dto.mode === 'MR') {
      if (!dto.mrUrl) throw new BusinessException(ErrorCode.BAD_REQUEST, 'MR 模式需要 mrUrl');
      parseMrUrl(dto.mrUrl, repo.platform); // 提前校验格式
    }

    const task = await this.prisma.reviewTask.create({
      data: {
        repoId: dto.repoId,
        modelId: dto.modelId ?? null,
        mode: dto.mode,
        fromRef: dto.fromRef ?? null,
        toRef: dto.toRef ?? null,
        commitSha: dto.commitSha ?? null,
        mrUrl: dto.mrUrl ?? null,
        requirementBackground: dto.requirementBackground ?? null,
        status: 'PENDING',
        stage: 'queued',
        progress: 0,
        createdBy: operatorId,
      },
    });
    await this.queue.enqueue(task.id);
    return this.toResponse(task, {});
  }

  async cancel(id: string): Promise<void> {
    const task = await this.ensureExists(id);
    if (TERMINAL.includes(task.status)) {
      throw new BusinessException(ErrorCode.REVIEW_TASK_NOT_CANCELLABLE);
    }
    // 队列中未启动 → 直接移除并终态
    const removed = await this.queue.removePending(id);
    if (removed) {
      await this.markCancelled(id);
      await this.events.publish(id, { type: 'finished', status: 'CANCELLED', message: '已取消' });
      return;
    }
    // PREPARING/RUNNING：kill 子进程（无子进程时 worker 在阶段边界读到 CANCELLED 自停）
    this.executor.cancel(id);
    await this.markCancelled(id);
  }

  /** worker 阶段边界自查：任务是否已被标记取消 */
  async isCancelled(taskId: string): Promise<boolean> {
    const t = await this.prisma.reviewTask.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
    return t?.status === 'CANCELLED';
  }

  /** 重跑：同参数新建任务 */
  async rerun(id: string, operatorId?: string): Promise<TaskResponseDto> {
    const task = await this.ensureExists(id);
    return this.create(
      {
        repoId: task.repoId,
        modelId: task.modelId ?? undefined,
        mode: task.mode,
        fromRef: task.fromRef ?? undefined,
        toRef: task.toRef ?? undefined,
        commitSha: task.commitSha ?? undefined,
        mrUrl: task.mrUrl ?? undefined,
        requirementBackground: task.requirementBackground ?? undefined,
      },
      operatorId,
    );
  }

  async findAll(
    query: QueryTaskDto,
    scopeFilter: Record<string, unknown>,
  ): Promise<PageResult<TaskResponseDto>> {
    const businessWhere: Prisma.ReviewTaskWhereInput = {
      deletedAt: null,
      ...(query.repoId ? { repoId: query.repoId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.gateStatus ? { gateStatus: query.gateStatus } : {}),
    };
    const where: Prisma.ReviewTaskWhereInput = {
      AND: [businessWhere, scopeFilter as Prisma.ReviewTaskWhereInput],
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.reviewTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { repo: { select: { name: true } }, model: { select: { name: true } } },
        ...toSkipTake(query),
      }),
      this.prisma.reviewTask.count({ where }),
    ]);

    // 附带 severity 聚合（一次 groupBy 避免 N+1）
    const taskIds = list.map((t) => t.id);
    const groups = taskIds.length
      ? await this.prisma.reviewFinding.groupBy({
          by: ['taskId', 'severity'],
          where: { taskId: { in: taskIds }, deletedAt: null },
          _count: { _all: true },
        })
      : [];
    const severityMap = new Map<string, Record<string, number>>();
    for (const g of groups) {
      const m = severityMap.get(g.taskId) ?? {};
      m[g.severity] = g._count._all;
      severityMap.set(g.taskId, m);
    }

    return toPageResult(
      list.map((t) => this.toResponse(t, severityMap.get(t.id) ?? {})),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<TaskResponseDto> {
    const task = await this.prisma.reviewTask.findFirst({
      where: { id, deletedAt: null },
      include: { repo: { select: { name: true } }, model: { select: { name: true } } },
    });
    if (!task) throw new BusinessException(ErrorCode.REVIEW_TASK_NOT_FOUND);
    const groups = await this.prisma.reviewFinding.groupBy({
      by: ['severity'],
      where: { taskId: id, deletedAt: null },
      _count: { _all: true },
    });
    const severityCount: Record<string, number> = {};
    for (const g of groups) severityCount[g.severity] = g._count._all;
    return this.toResponse(task, severityCount);
  }

  /** 阶段推进（worker 调用）：preparing 阶段记 startedAt */
  async markStage(taskId: string, stage: string, progress: number): Promise<void> {
    const data: Prisma.ReviewTaskUpdateInput = { stage, progress };
    if (stage === 'preparing') {
      data.status = 'PREPARING';
      data.startedAt = new Date();
    } else if (stage === 'running') data.status = 'RUNNING';
    else if (stage === 'evaluating' || stage === 'publishing') data.status = 'EVALUATING';
    // 不覆盖已取消的任务
    await this.prisma.reviewTask.updateMany({
      where: { id: taskId, status: { notIn: TERMINAL } },
      data,
    });
  }

  async markCancelled(taskId: string): Promise<void> {
    await this.prisma.reviewTask
      .updateMany({
        where: { id: taskId, status: { notIn: TERMINAL } },
        data: { status: 'CANCELLED', stage: 'done', finishedAt: new Date() },
      })
      .catch(() => undefined);
  }

  /** 任务完成时落库 findings + trace 索引（worker 调用） */
  async persistResult(
    taskId: string,
    repoId: string,
    result: OcrResultJson,
    traceBuffer: Array<{
      seq: number;
      requestNo?: number;
      taskType?: string;
      filePath?: string;
      model?: string;
      durationMs?: number;
      statusCode?: number;
      tokensIn?: number | null;
      tokensOut?: number | null;
      rawPath: string;
      rawOffset: number;
      rawLen: number;
    }>,
  ): Promise<{ comments: number; severityCount: Record<string, number> }> {
    const comments = result.comments ?? [];
    const severityCount: Record<string, number> = {};

    // 指纹去重：同 repo 历史 OPEN/RESOLVED finding 的 fingerprint → firstSeenTaskId
    const historical = await this.prisma.reviewFinding.findMany({
      where: {
        deletedAt: null,
        status: { in: ['OPEN', 'RESOLVED'] },
        task: { repoId, deletedAt: null },
      },
      select: { fingerprint: true, firstSeenTaskId: true },
    });
    const rows = this.buildFindingRows(
      taskId,
      comments,
      new Map(historical.map((h) => [h.fingerprint, h.firstSeenTaskId])),
      severityCount,
    );

    await this.prisma.$transaction(async (tx) => {
      if (rows.length) await tx.reviewFinding.createMany({ data: rows });
      if (traceBuffer.length) {
        await tx.reviewTraceCall.createMany({
          data: traceBuffer.map((t) => ({
            taskId,
            seq: t.seq,
            requestNo: t.requestNo ?? null,
            taskType: t.taskType ?? null,
            filePath: t.filePath ?? null,
            model: t.model ?? null,
            durationMs: t.durationMs ?? 0,
            statusCode: t.statusCode ?? null,
            tokensIn: t.tokensIn ?? null,
            tokensOut: t.tokensOut ?? null,
            rawPath: t.rawPath,
            rawOffset: t.rawOffset,
            rawLen: t.rawLen,
          })),
        });
      }
      // 历史遗留 finding 的 lastSeenTaskId 更新（本次再次出现的）
      if (rows.length) {
        const seen = rows.filter((r) => !r.isNew).map((r) => r.fingerprint);
        if (seen.length) {
          await tx.reviewFinding.updateMany({
            where: {
              deletedAt: null,
              fingerprint: { in: seen },
              status: { in: ['OPEN', 'RESOLVED'] },
              taskId: { not: taskId },
              task: { repoId },
            },
            data: { lastSeenTaskId: taskId },
          });
        }
      }
    });

    return { comments: rows.length, severityCount };
  }

  /** MR 回写（worker 调用；独立入口见 controller publish 重试） */
  async publishToMr(
    taskId: string,
    repo: ReviewRepo,
    mrUrl: string,
    headSha?: string,
    diffRefs?: { baseSha: string; startSha: string; headSha: string },
    gate?: GateEvaluationResult,
  ): Promise<{ noteUrl: string | null; inlineCount: number; inlineFailed: number }> {
    const task = await this.ensureExists(taskId);
    const findings = await this.prisma.reviewFinding.findMany({
      where: { taskId, deletedAt: null, status: 'OPEN' },
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
    });
    const parsed = parseMrUrl(mrUrl, repo.platform);
    const comments = findings
      .filter((f) => f.startLine > 0)
      .map((f) => ({
        path: f.path,
        line: f.endLine || f.startLine,
        body: `**[${f.severity.toUpperCase()}] ${f.category}** — ${f.content}${
          f.suggestionCode ? `\n\n\`\`\`suggestion\n${f.suggestionCode}\n\`\`\`` : ''
        }`,
      }));

    const stats = (task.stats as Record<string, unknown> | null) ?? {};
    const gateLine = gate
      ? `\n- 质量红线：${gate.status}${gate.detail?.reasons?.length ? `（${gate.detail.reasons.join('；')}）` : ''}`
      : '';
    const summary =
      `## 🤖 NestReview AI 评审总结\n\n` +
      `- 状态：${task.status}\n- 评审文件：${stats['filesReviewed'] ?? '-'}，发现问题 ${findings.length} 个\n` +
      `- 严重级：critical ${((stats['severityCount'] as Record<string, number>) ?? {})['critical'] ?? 0} / high ${((stats['severityCount'] as Record<string, number>) ?? {})['high'] ?? 0} / medium ${((stats['severityCount'] as Record<string, number>) ?? {})['medium'] ?? 0} / low ${((stats['severityCount'] as Record<string, number>) ?? {})['low'] ?? 0}\n` +
      `- token：${stats['totalTokens'] ?? '-'}，耗时 ${stats['elapsed'] ?? '-'}${gateLine}\n\n` +
      `> 详细报告见 NestReview 平台任务详情。`;

    return this.mrIntegration.publish(repo, parsed, comments, summary, diffRefs, headSha);
  }

  /** 手动触发/重试回写（controller 用） */
  async publish(
    id: string,
  ): Promise<{ noteUrl: string | null; inlineCount: number; inlineFailed: number }> {
    const task = await this.ensureExists(id);
    if (!task.mrUrl) throw new BusinessException(ErrorCode.REVIEW_PUBLISH_NOT_CONFIGURED);
    const repo = await this.repoService.getForRun(task.repoId);
    const gate = task.gateStatus
      ? ({ status: task.gateStatus, detail: task.gateDetail as never } as GateEvaluationResult)
      : undefined;
    const result = await this.publishToMr(id, repo, task.mrUrl, undefined, undefined, gate);
    await this.prisma.reviewTask.update({
      where: { id },
      data: { mrState: 'PUBLISHED', mrDiscussionUrl: result.noteUrl },
    });
    return result;
  }

  /** diff.patch 内容（前端 diff2html 渲染） */
  async readDiff(id: string): Promise<string> {
    const task = await this.ensureExists(id);
    if (!task.diffPath) throw new BusinessException(ErrorCode.NOT_FOUND, 'diff 尚未生成');
    return readFile(task.diffPath, 'utf8');
  }

  /** manifest 覆盖率 */
  async readManifest(id: string): Promise<OcrManifest | null> {
    const task = await this.ensureExists(id);
    if (!task.resultPath) return null;
    try {
      const result = JSON.parse(await readFile(task.resultPath, 'utf8')) as OcrResultJson;
      return result.manifest ?? null;
    } catch {
      return null;
    }
  }

  /** trace 调用索引 */
  async traceCalls(taskId: string): Promise<
    Array<{
      id: string;
      seq: number;
      requestNo: number | null;
      taskType: string | null;
      filePath: string | null;
      model: string | null;
      durationMs: number;
      statusCode: number | null;
      tokensIn: number | null;
      tokensOut: number | null;
      createdAt: Date;
    }>
  > {
    await this.ensureExists(taskId);
    return this.prisma.reviewTraceCall.findMany({
      where: { taskId },
      orderBy: { seq: 'asc' },
      select: {
        id: true,
        seq: true,
        requestNo: true,
        taskType: true,
        filePath: true,
        model: true,
        durationMs: true,
        statusCode: true,
        tokensIn: true,
        tokensOut: true,
        createdAt: true,
      },
    });
  }

  /** 单次完整 raw 记录（思维链回放）：按 offset 从 JSONL 读取 */
  async traceCallDetail(taskId: string, seq: number): Promise<unknown> {
    const call = await this.prisma.reviewTraceCall.findUnique({
      where: { taskId_seq: { taskId, seq } },
    });
    if (!call) throw new BusinessException(ErrorCode.NOT_FOUND, '调用记录不存在');
    const fh = await open(call.rawPath, 'r');
    try {
      const buf = Buffer.alloc(call.rawLen);
      await fh.read(buf, 0, call.rawLen, call.rawOffset);
      return JSON.parse(buf.toString('utf8'));
    } finally {
      await fh.close().catch(() => undefined);
    }
  }

  /** 发现列表 */
  async findings(taskId: string, query: QueryFindingDto): Promise<FindingResponseDto[]> {
    await this.ensureExists(taskId);
    const list = await this.prisma.reviewFinding.findMany({
      where: {
        taskId,
        deletedAt: null,
        ...(query.severity ? { severity: query.severity.toLowerCase() } : {}),
        ...(query.category ? { category: query.category.toLowerCase() } : {}),
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.isNew === 'true' ? { isNew: true } : {}),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
    });
    return list.map((f) => ({
      id: f.id,
      taskId: f.taskId,
      path: f.path,
      startLine: f.startLine,
      endLine: f.endLine,
      content: f.content,
      thinking: f.thinking,
      category: f.category,
      severity: f.severity,
      suggestionCode: f.suggestionCode,
      existingCode: f.existingCode,
      fingerprint: f.fingerprint,
      status: f.status,
      isNew: f.isNew,
      createdAt: f.createdAt,
    }));
  }

  /** 发现状态流转 */
  async updateFindingStatus(
    id: string,
    status: 'OPEN' | 'FIXED' | 'IGNORED' | 'RESOLVED',
  ): Promise<void> {
    const finding = await this.prisma.reviewFinding.findFirst({
      where: { id, deletedAt: null },
    });
    if (!finding) throw new BusinessException(ErrorCode.REVIEW_FINDING_NOT_FOUND);
    await this.prisma.reviewFinding.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === 'FIXED' ? new Date() : null,
      },
    });
  }

  /** 构建 finding 落库行：severity 归一 + 指纹 + 遗留继承 */
  private buildFindingRows(
    taskId: string,
    comments: NonNullable<OcrResultJson['comments']>,
    historicalMap: Map<string, string | null>,
    severityCount: Record<string, number>,
  ): Prisma.ReviewFindingCreateManyInput[] {
    return comments.map((c) => {
      const severity = (c.severity ?? 'medium').toLowerCase();
      severityCount[severity] = (severityCount[severity] ?? 0) + 1;
      const fingerprint = fingerprintOf(c.path, c.category ?? 'other', c.content);
      const firstSeen = historicalMap.get(fingerprint);
      return {
        taskId,
        path: c.path,
        startLine: c.start_line ?? 0,
        endLine: c.end_line ?? 0,
        content: c.content ?? '',
        thinking: c.thinking ?? null,
        category: (c.category ?? 'other').toLowerCase(),
        severity,
        suggestionCode: c.suggestion_code ?? null,
        existingCode: c.existing_code ?? null,
        fingerprint,
        status: 'OPEN',
        isNew: !historicalMap.has(fingerprint),
        firstSeenTaskId: firstSeen ?? taskId, // 遗留问题继承首次发现任务
        lastSeenTaskId: taskId,
      };
    });
  }

  async ensureExists(id: string): Promise<ReviewTask> {
    const task = await this.prisma.reviewTask.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new BusinessException(ErrorCode.REVIEW_TASK_NOT_FOUND);
    return task;
  }

  private toResponse(
    task: ReviewTask & { repo?: { name: string } | null; model?: { name: string } | null },
    severityCount: Record<string, number>,
  ): TaskResponseDto {
    return {
      id: task.id,
      repoId: task.repoId,
      repoName: task.repo?.name ?? null,
      modelId: task.modelId,
      modelName: task.model?.name ?? null,
      mode: task.mode,
      fromRef: task.fromRef,
      toRef: task.toRef,
      commitSha: task.commitSha,
      mrUrl: task.mrUrl,
      mrState: task.mrState,
      mrDiscussionUrl: task.mrDiscussionUrl,
      requirementBackground: task.requirementBackground,
      status: task.status,
      stage: task.stage,
      progress: task.progress,
      gateStatus: task.gateStatus,
      gateDetail: task.gateDetail,
      stats: task.stats,
      sessionId: task.sessionId,
      error: task.error,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      severityCount,
    };
  }
}

/** 发现指纹：path + category + 归一化 content（去空白/大小写） */
function fingerprintOf(path: string, category: string, content: string): string {
  const normalized = (content ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha256').update(`${path}|${category}|${normalized}`).digest('hex');
}

/** 保留导出：worker 的取消桥接 */
export function taskStatusIsTerminal(status: ReviewTaskStatus): boolean {
  return TERMINAL.includes(status);
}

export type { GateEvaluationResult };
export { ReviewGateStatus };
