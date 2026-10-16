import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ReviewRepo } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { PageResult, toPageResult, toSkipTake } from '@/shared/dto/pagination.dto';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { GitWorkspaceService } from '../shared/git-workspace.service';
import { ReviewCryptoService } from '../shared/review-crypto.service';
import { CreateRepoDto, QueryRepoDto, RepoResponseDto, UpdateRepoDto } from './dto/review-repo.dto';

@Injectable()
export class ReviewRepoService {
  private readonly logger = new Logger(ReviewRepoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ReviewCryptoService,
    private readonly workspace: GitWorkspaceService,
  ) {}

  async create(dto: CreateRepoDto, operatorId?: string): Promise<RepoResponseDto> {
    const exists = await this.prisma.reviewRepo.findFirst({
      where: { gitUrl: dto.gitUrl, deletedAt: null },
    });
    if (exists) throw new BusinessException(ErrorCode.CONFLICT, '该 gitUrl 已登记');

    const repo = await this.prisma.reviewRepo.create({
      data: {
        name: dto.name,
        platform: dto.platform,
        gitUrl: dto.gitUrl,
        defaultBranch: dto.defaultBranch ?? 'main',
        credentialEnc: dto.credential ? this.crypto.encrypt(dto.credential) : null,
        createdBy: operatorId,
      },
    });
    this.logger.log(`新增评审仓库: ${repo.name}(${repo.id})`);
    return this.toResponse(repo);
  }

  async update(id: string, dto: UpdateRepoDto): Promise<RepoResponseDto> {
    await this.ensureExists(id);
    const credentialEnc =
      dto.credential === undefined
        ? undefined
        : dto.credential === '-'
          ? null
          : this.crypto.encrypt(dto.credential);

    const repo = await this.prisma.reviewRepo.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.platform !== undefined && { platform: dto.platform }),
        ...(dto.gitUrl !== undefined && { gitUrl: dto.gitUrl }),
        ...(dto.defaultBranch !== undefined && { defaultBranch: dto.defaultBranch }),
        ...(credentialEnc !== undefined && { credentialEnc }),
        // 地址/凭证变更后工作区需要重新同步
        ...(dto.gitUrl !== undefined || credentialEnc !== undefined
          ? { workspaceStatus: 'NONE' }
          : {}),
      },
    });
    return this.toResponse(repo);
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    const running = await this.prisma.reviewTask.count({
      where: { repoId: id, deletedAt: null, status: { in: ['PENDING', 'PREPARING', 'RUNNING'] } },
    });
    if (running > 0) throw new BusinessException(ErrorCode.CONFLICT, '存在进行中的评审任务');
    await this.prisma.reviewRepo.update({ where: { id }, data: { deletedAt: new Date() } });
    // 工作区目录异步清理（失败不阻塞）
    void this.workspace.removeDir(this.workspace.repoDir(id)).catch(() => undefined);
  }

  async findAll(query: QueryRepoDto): Promise<PageResult<RepoResponseDto>> {
    const where: Prisma.ReviewRepoWhereInput = {
      deletedAt: null,
      ...(query.keyword ? { name: { contains: query.keyword, mode: 'insensitive' } } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.reviewRepo.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.reviewRepo.count({ where }),
    ]);
    return toPageResult(
      list.map((r) => this.toResponse(r)),
      total,
      query,
    );
  }

  /** 同步工作区（clone/fetch），返回最新仓库状态 */
  async sync(id: string): Promise<RepoResponseDto> {
    const repo = await this.ensureExists(id);
    const status = await this.workspace.syncRepo(repo);
    const updated = await this.prisma.reviewRepo.update({
      where: { id },
      data: { workspaceStatus: status, lastSyncAt: new Date() },
    });
    this.logger.log(`仓库同步 ${repo.name}: ${status}`);
    return this.toResponse(updated);
  }

  /** 取仓库（任务执行器用），工作区未就绪时自动 ensureReady */
  async getForRun(id: string): Promise<ReviewRepo> {
    return this.ensureExists(id);
  }

  private async ensureExists(id: string): Promise<ReviewRepo> {
    const repo = await this.prisma.reviewRepo.findFirst({
      where: { id, deletedAt: null },
    });
    if (!repo) throw new BusinessException(ErrorCode.REVIEW_REPO_NOT_FOUND);
    return repo;
  }

  private toResponse(repo: ReviewRepo): RepoResponseDto {
    return {
      id: repo.id,
      name: repo.name,
      platform: repo.platform,
      gitUrl: repo.gitUrl,
      defaultBranch: repo.defaultBranch,
      hasCredential: Boolean(repo.credentialEnc),
      workspaceStatus: repo.workspaceStatus,
      lastSyncAt: repo.lastSyncAt,
      createdBy: repo.createdBy,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
    };
  }
}
