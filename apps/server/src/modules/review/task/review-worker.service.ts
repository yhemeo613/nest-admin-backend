import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReviewModel, ReviewRepo, ReviewTask, ReviewTaskStatus } from '@prisma/client';
import { Job, Worker } from 'bullmq';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ReviewEvent } from '@/shared/constants/event';

import { GateEvaluationResult, ReviewGateService } from '../gate/review-gate.service';
import { MrIntegrationService } from '../integrations/mr-integration.service';
import { ReviewModelService } from '../model/review-model.service';
import { ReviewRepoService } from '../repo/review-repo.service';
import { GitWorkspaceService } from '../shared/git-workspace.service';
import { OcrExecutorService, OcrRunResult } from './executors/ocr-executor.service';
import { extractUsage, OcrResultJson } from './parsers/ocr-types';
import { RawTailer } from './parsers/raw-tailer';
import { ReviewEventsService } from './review-events.service';
import { parseRedisUrl, REVIEW_QUEUE_NAME } from './review-queue.service';
import { ReviewTaskService } from './review-task.service';

interface TaskJobData {
  taskId: string;
}

export interface TraceBufferEntry {
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
}

/** run() 的跨阶段上下文 */
interface RunContext {
  taskId: string;
  repo: ReviewRepo;
  model: ReviewModel;
  repoDir: string;
  homeDir: string;
  resultPath: string;
  diffPath: string;
  args: string[];
  env: Record<string, string>;
  headSha?: string;
  diffRefs?: { baseSha: string; startSha: string; headSha: string };
}

/**
 * 评审 Worker：BullMQ 消费 review 队列，驱动任务状态机。
 * 同进程部署（dev/小团队）；多实例时 BullMQ 自动负载均衡，事件走 Redis 天然兼容。
 */
@Injectable()
export class ReviewWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewWorkerService.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: ReviewEventsService,
    private readonly executor: OcrExecutorService,
    private readonly workspace: GitWorkspaceService,
    private readonly repoService: ReviewRepoService,
    private readonly modelService: ReviewModelService,
    private readonly gateService: ReviewGateService,
    private readonly mrIntegration: MrIntegrationService,
    private readonly taskService: ReviewTaskService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    const connection = parseRedisUrl(
      this.config.get<string>('redis.url', 'redis://localhost:6379'),
    );
    this.worker = new Worker<TaskJobData>(REVIEW_QUEUE_NAME, (job) => this.process(job), {
      connection,
      concurrency: this.config.get<number>('review.workerConcurrency', 1),
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error(`评审 job 失败 ${job?.id}: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<TaskJobData>): Promise<void> {
    const { taskId } = job.data;
    const task = await this.prisma.reviewTask.findFirst({
      where: { id: taskId, deletedAt: null },
    });
    if (!task || task.status !== ReviewTaskStatus.PENDING) return; // 已取消/重复

    try {
      const ctx = await this.prepare(task);
      if (!ctx) return; // 准备阶段被取消
      const { runResult, traceBuffer } = await this.executeOcr(ctx);
      await this.finalize(task, ctx, runResult, traceBuffer);
    } catch (e) {
      const err = e as Error;
      this.logger.error(`任务 ${taskId} 执行失败: ${err.message}`);
      await this.failTask(taskId, err.message);
    }
  }

  /** ①-④ 准备阶段：工作区 / refs / diff / OCR 环境。返回 null 表示已取消。 */
  private async prepare(task: ReviewTask): Promise<RunContext | null> {
    const taskId = task.id;
    const repo = await this.repoService.getForRun(task.repoId);
    const model = task.modelId
      ? await this.modelService.getEnabled(task.modelId)
      : await this.modelService.getDefault();
    if (!model) throw new Error('未配置可用模型，请先在模型配置页添加');

    const homeDir = this.workspace.taskDir(taskId);
    const resultPath = path.join(homeDir, 'result.json');
    const diffPath = path.join(homeDir, 'diff.patch');
    await mkdir(path.join(homeDir, '.opencodereview'), { recursive: true });

    await this.taskService.markStage(taskId, 'preparing', 5);
    await this.events.publish(taskId, {
      type: 'stage',
      stage: 'preparing',
      progress: 5,
      message: '准备工作区',
    });

    const repoDir = await this.workspace.ensureReady(repo);
    await this.prisma.reviewRepo.update({
      where: { id: repo.id },
      data: { workspaceStatus: 'READY', lastSyncAt: new Date() },
    });

    // MR 模式解析 refs（RANGE/COMMIT 直接用入参）
    let fromRef = task.fromRef ?? undefined;
    let toRef = task.toRef ?? repo.defaultBranch;
    let diffRefs: RunContext['diffRefs'];
    let headSha: string | undefined;
    if (task.mode === 'MR' && task.mrUrl) {
      const refs = await this.mrIntegration.resolveRefs(repo, task.mrUrl);
      fromRef = refs.fromRef;
      toRef = refs.toRef;
      diffRefs = refs.diffRefs;
      headSha = refs.headSha;
      await this.prisma.reviewTask.update({
        where: { id: taskId },
        data: { fromRef, toRef, platformProject: refs.platformProject, mrIid: refs.mrIid },
      });
    }

    const patch =
      task.mode === 'COMMIT' && task.commitSha
        ? await this.workspace.show(task.repoId, task.commitSha)
        : await this.workspace.diff(task.repoId, fromRef ?? repo.defaultBranch, toRef);
    await writeFile(diffPath, patch, 'utf8');

    // 阶段边界：PREPARING 期间被取消则停止
    if (await this.taskService.isCancelled(taskId)) {
      await this.events.publish(taskId, {
        type: 'finished',
        status: 'CANCELLED',
        message: '已取消',
      });
      return null;
    }

    // OCR 任务级配置（extra_body：thinking 开关等）
    const ocrConfig: Record<string, unknown> = {};
    if (model.extraBody && typeof model.extraBody === 'object') {
      ocrConfig.llm = { extra_body: model.extraBody };
    }
    await writeFile(
      path.join(homeDir, '.opencodereview', 'config.json'),
      JSON.stringify(ocrConfig, null, 2),
      'utf8',
    );

    const apiKey = this.modelService.decryptApiKey(model.apiKeyEnc);
    if (!apiKey) throw new Error('模型 apiKey 解密失败');

    return {
      taskId,
      repo,
      model,
      repoDir,
      homeDir,
      resultPath,
      diffPath,
      env: {
        OCR_LLM_URL: model.baseUrl,
        OCR_LLM_TOKEN: apiKey,
        OCR_LLM_MODEL: model.model,
        OCR_LLM_PROTOCOL: model.protocol,
      },
      args: this.buildOcrArgs(task.mode, {
        repoDir,
        fromRef,
        toRef,
        commitSha: task.commitSha ?? undefined,
        background: task.requirementBackground ?? undefined,
        resultPath,
      }),
      headSha,
      diffRefs,
    };
  }

  /** ⑤⑥ 执行阶段：raw tail → spawn OCR → 返回结果与轨迹缓冲 */
  private async executeOcr(
    ctx: RunContext,
  ): Promise<{ runResult: OcrRunResult; traceBuffer: TraceBufferEntry[] }> {
    const { taskId } = ctx;
    await this.taskService.markStage(taskId, 'running', 15);
    await this.events.publish(taskId, {
      type: 'stage',
      stage: 'running',
      progress: 15,
      message: '开始 AI 评审',
    });

    const traceBuffer: TraceBufferEntry[] = [];
    let traceSeq = 0;
    const tailer = new RawTailer(ctx.homeDir, (entry) => {
      traceSeq += 1;
      const usage = extractUsage(entry.record);
      const item: TraceBufferEntry = {
        seq: traceSeq,
        requestNo: entry.record.request_no,
        taskType: entry.record.task_type,
        filePath: entry.record.file_path,
        model: entry.record.model,
        durationMs: entry.record.duration_ms,
        statusCode: entry.record.status_code,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        rawPath: entry.filePath,
        rawOffset: entry.offset,
        rawLen: entry.length,
      };
      traceBuffer.push(item);
      void this.events.publish(taskId, { type: 'trace_call', call: { ...item } });
    });
    tailer.start();

    const timeoutMs = this.config.get<number>('review.taskTimeoutMs', 1800000);
    const runResult = await this.executor.run(taskId, {
      bin: this.config.get<string>('review.ocrBinPath', 'ocr'),
      argsPrefix: this.config.get<string[]>('review.ocrBinArgsPrefix', []),
      args: ctx.args,
      cwd: ctx.repoDir,
      homeDir: ctx.homeDir,
      env: ctx.env,
      timeoutMs,
      onLine: (stream, line) => {
        void this.events.publish(taskId, {
          type: 'log',
          level: stream === 'stderr' ? 'warn' : 'info',
          message: line.slice(0, 500),
        });
      },
    });
    await tailer.stop();
    return { runResult, traceBuffer };
  }

  /** ⑦-⑩ 收尾：解析 → 入库 → 红线 → 回写 → 通知 */
  private async finalize(
    task: ReviewTask,
    ctx: RunContext,
    runResult: OcrRunResult,
    traceBuffer: TraceBufferEntry[],
  ): Promise<void> {
    const { taskId } = ctx;
    if (runResult.timedOut) {
      const timeoutMs = this.config.get<number>('review.taskTimeoutMs', 1800000);
      throw new Error(`任务超时（${Math.round(timeoutMs / 60000)} 分钟）`);
    }
    if (runResult.cancelled) {
      await this.taskService.markCancelled(taskId);
      await this.events.publish(taskId, {
        type: 'finished',
        status: 'CANCELLED',
        message: '已取消',
      });
      return;
    }

    await this.taskService.markStage(taskId, 'evaluating', 90);
    await this.events.publish(taskId, { type: 'stage', stage: 'evaluating', progress: 90 });

    const resultJson = await this.readResult(ctx.resultPath);
    if (!resultJson) {
      throw new Error(
        `OCR 未产出结果文件（exit=${runResult.exitCode}），请检查 ocr 二进制与模型配置`,
      );
    }

    // 阶段边界：评审完成后（回写前）被取消则停止
    if (await this.taskService.isCancelled(taskId)) {
      await this.events.publish(taskId, {
        type: 'finished',
        status: 'CANCELLED',
        message: '已取消',
      });
      return;
    }

    const stats = await this.taskService.persistResult(
      taskId,
      task.repoId,
      resultJson,
      traceBuffer,
    );
    const gate = await this.gateService.evaluate(task.repoId, {
      critical: stats.severityCount['critical'] ?? 0,
      high: stats.severityCount['high'] ?? 0,
    });

    // 终态更新加 status 保护，避免覆盖并发取消
    const completed = await this.prisma.reviewTask.updateMany({
      where: { id: taskId, status: { notIn: ['CANCELLED', 'FAILED'] } },
      data: {
        status: ReviewTaskStatus.SUCCESS,
        stage: 'done',
        progress: 100,
        gateStatus: gate.status,
        gateDetail: gate.detail as object,
        stats: {
          severityCount: stats.severityCount,
          comments: stats.comments,
          filesReviewed: resultJson.summary?.files_reviewed ?? null,
          inputTokens: resultJson.summary?.input_tokens ?? null,
          outputTokens: resultJson.summary?.output_tokens ?? null,
          totalTokens: resultJson.summary?.total_tokens ?? null,
          elapsed: resultJson.summary?.elapsed ?? null,
          toolCalls: resultJson.tool_calls?.total ?? null,
        },
        sessionId: resultJson.session_id ?? null,
        resultPath: ctx.resultPath,
        diffPath: ctx.diffPath,
        homeDir: ctx.homeDir,
        finishedAt: new Date(),
      },
    });
    if (completed.count === 0) return; // 已被取消/失败，静默收尾

    const mrState = await this.publishMr(task, ctx, gate);
    await this.emitFinished(taskId, task.createdBy, gate, stats.comments, mrState);
  }

  private async publishMr(
    task: ReviewTask,
    ctx: RunContext,
    gate: GateEvaluationResult,
  ): Promise<string | null> {
    if (task.mode !== 'MR' || !task.mrUrl) return null;
    const { taskId } = ctx;
    await this.events.publish(taskId, {
      type: 'stage',
      stage: 'publishing',
      progress: 95,
      message: '回写 MR 评论区',
    });
    try {
      const pub = await this.taskService.publishToMr(
        taskId,
        ctx.repo,
        task.mrUrl,
        ctx.headSha,
        ctx.diffRefs,
        gate,
      );
      await this.prisma.reviewTask.update({
        where: { id: taskId },
        data: { mrState: 'PUBLISHED', mrDiscussionUrl: pub.noteUrl },
      });
      return 'PUBLISHED';
    } catch (e) {
      this.logger.warn(`任务 ${taskId} MR 回写失败: ${(e as Error).message}`);
      await this.prisma.reviewTask.update({ where: { id: taskId }, data: { mrState: 'FAILED' } });
      return 'FAILED';
    }
  }

  private async emitFinished(
    taskId: string,
    createdBy: string | null,
    gate: GateEvaluationResult,
    comments: number,
    mrState: string | null,
  ): Promise<void> {
    this.eventEmitter.emit(ReviewEvent.taskFinished, {
      taskId,
      status: 'SUCCESS',
      gateStatus: gate.status,
      createdBy: createdBy ?? undefined,
    });
    if (gate.status === 'FAIL') {
      this.eventEmitter.emit(ReviewEvent.gateFailed, {
        taskId,
        gateDetail: gate.detail,
        createdBy: createdBy ?? undefined,
      });
    }
    await this.events.publish(taskId, {
      type: 'finished',
      status: 'SUCCESS',
      gateStatus: gate.status,
      message: mrState === 'PUBLISHED' ? '评审完成，已回写 MR' : '评审完成',
    });
    this.logger.log(`任务 ${taskId} 完成: gate=${gate.status} comments=${comments}`);
  }

  private async readResult(resultPath: string): Promise<OcrResultJson | null> {
    try {
      const raw = await readFile(resultPath, 'utf8');
      return JSON.parse(raw) as OcrResultJson;
    } catch {
      return null;
    }
  }

  private async failTask(taskId: string, message: string): Promise<void> {
    // 终态保护：已 CANCELLED/SUCCESS 的任务不被失败覆盖
    const updated = await this.prisma.reviewTask
      .updateMany({
        where: { id: taskId, status: { notIn: ['SUCCESS', 'CANCELLED'] } },
        data: {
          status: ReviewTaskStatus.FAILED,
          stage: 'done',
          error: message.slice(0, 2000),
          finishedAt: new Date(),
        },
      })
      .catch(() => ({ count: 0 }));
    if (updated.count === 0) return;
    const task = await this.prisma.reviewTask
      .findUnique({ where: { id: taskId } })
      .catch(() => null);
    this.eventEmitter.emit(ReviewEvent.taskFailed, {
      taskId,
      error: message,
      createdBy: task?.createdBy ?? undefined,
    });
    await this.events.publish(taskId, { type: 'finished', status: 'FAILED', message });
  }

  private buildOcrArgs(
    mode: ReviewTask['mode'],
    opts: {
      repoDir: string;
      fromRef?: string;
      toRef: string;
      commitSha?: string;
      background?: string;
      resultPath: string;
    },
  ): string[] {
    const args = [
      'review',
      '--repo',
      opts.repoDir,
      '--format',
      'json',
      '--output',
      opts.resultPath,
      '--audience',
      'agent',
    ];
    if (mode === 'COMMIT' && opts.commitSha) {
      args.push('--commit', opts.commitSha);
    } else {
      args.push('--from', opts.fromRef ?? 'HEAD~1', '--to', opts.toRef);
    }
    if (opts.background) {
      args.push('--background', opts.background);
    }
    return args;
  }
}
