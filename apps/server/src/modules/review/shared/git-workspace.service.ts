import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReviewRepo } from '@prisma/client';

import { ReviewCryptoService } from './review-crypto.service';

const execFileAsync = promisify(execFile);

export interface GitRunOptions {
  cwd?: string;
  timeoutMs?: number;
}

/**
 * 评审 Git 工作区：仓库 clone/fetch 与 diff 采集。
 * 凭证只在单次 git 命令执行时注入（clone 后立即把 origin 改回裸地址），不落盘 .git/config。
 */
@Injectable()
export class GitWorkspaceService {
  private readonly logger = new Logger(GitWorkspaceService.name);
  private readonly rootDir: string;

  constructor(
    config: ConfigService,
    private readonly crypto: ReviewCryptoService,
  ) {
    this.rootDir = path.resolve(
      process.cwd(),
      config.get<string>('review.workspaceDir') ?? 'workspaces/review',
    );
  }

  /** 仓库工作区目录（workspaces/review/repos/{repoId}） */
  repoDir(repoId: string): string {
    return path.join(this.rootDir, 'repos', repoId);
  }

  /** 任务工作区目录（workspaces/review/tasks/{taskId}，用作任务级 HOME） */
  taskDir(taskId: string): string {
    return path.join(this.rootDir, 'tasks', taskId);
  }

  getRootDir(): string {
    return this.rootDir;
  }

  /** 同步仓库：不存在则 clone，存在则 fetch --prune。返回更新后的工作区状态。 */
  async syncRepo(
    repo: Pick<ReviewRepo, 'id' | 'gitUrl' | 'credentialEnc'>,
  ): Promise<'READY' | 'ERROR'> {
    const dir = this.repoDir(repo.id);
    try {
      const authUrl = this.withCredential(repo.gitUrl, repo.credentialEnc);
      if (!existsSync(path.join(dir, '.git'))) {
        mkdirSync(path.dirname(dir), { recursive: true });
        await this.runGit(['clone', '--', authUrl, dir], { timeoutMs: 10 * 60_000 });
        // clone 完成立即移除 config 里的凭证 remote，后续 fetch 走注入 URL
        await this.runGit(['remote', 'set-url', 'origin', '--', repo.gitUrl], { cwd: dir });
      } else {
        await this.runGit(
          ['fetch', '--prune', '--', authUrl, '+refs/heads/*:refs/remotes/origin/*'],
          { cwd: dir, timeoutMs: 5 * 60_000 },
        );
      }
      return 'READY';
    } catch (e) {
      this.logger.warn(`仓库同步失败 ${repo.gitUrl}: ${(e as Error).message}`);
      return 'ERROR';
    }
  }

  /** 分支区间 diff（任务执行前落盘 diff.patch 供前端渲染） */
  async diff(repoId: string, from: string, to: string): Promise<string> {
    // 注意：range 不能放在 `--` 之后（会被当作 pathspec）
    const { stdout } = await this.runGit(['diff', `${from}..${to}`], {
      cwd: this.repoDir(repoId),
      timeoutMs: 2 * 60_000,
    });
    return stdout;
  }

  /** 单提交 patch */
  async show(repoId: string, sha: string): Promise<string> {
    const { stdout } = await this.runGit(['show', '--pretty=medium', '--patch', sha], {
      cwd: this.repoDir(repoId),
      timeoutMs: 2 * 60_000,
    });
    return stdout;
  }

  /** 确保仓库已同步（任务 PREPARING 阶段调用），未就绪则同步 */
  async ensureReady(repo: Pick<ReviewRepo, 'id' | 'gitUrl' | 'credentialEnc'>): Promise<string> {
    const dir = this.repoDir(repo.id);
    const status = await this.syncRepo(repo);
    if (status === 'ERROR' && !existsSync(path.join(dir, '.git'))) {
      throw new Error(`仓库工作区准备失败: ${repo.gitUrl}`);
    }
    return dir;
  }

  /** 临时目录（模型连通测试等零散用途） */
  async tempDir(prefix: string): Promise<string> {
    return mkdtemp(path.join(tmpdir(), prefix));
  }

  async removeDir(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
  }

  /** HTTPS URL 注入凭证（credential 形如 user:token；SSH 地址不注入） */
  private withCredential(gitUrl: string, credentialEnc: string | null): string {
    if (!credentialEnc) return gitUrl;
    const credential = this.crypto.decrypt(credentialEnc);
    if (!credential) return gitUrl;
    if (!/^https?:\/\//i.test(gitUrl)) return gitUrl; // ssh://git@host:path 不支持注入
    const url = new URL(gitUrl);
    url.username = credential.split(':')[0] ?? '';
    url.password = credential.slice((credential.split(':')[0] ?? '').length + 1);
    return url.toString();
  }

  private async runGit(
    args: string[],
    opts: GitRunOptions = {},
  ): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('git', args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 60_000,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
  }
}
