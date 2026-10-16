import { Injectable, Logger } from '@nestjs/common';
import { ReviewPlatform, ReviewRepo } from '@prisma/client';

import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { ReviewCryptoService } from '../shared/review-crypto.service';

/** MR/PR 解析结果 */
export interface MrRefs {
  /** GitLab: urlencoded project path；GitHub: owner/repo */
  platformProject: string;
  mrIid: number;
  /** 评审基准：target/base 分支或 sha */
  fromRef: string;
  /** 评审目标：source/head 分支或 sha */
  toRef: string;
  /** GitLab diff_refs（行内 discussion 定位用） */
  diffRefs?: { baseSha: string; startSha: string; headSha: string };
  /** GitHub head sha（review 提交用） */
  headSha?: string;
}

export interface ParsedMrUrl {
  origin: string;
  platform: ReviewPlatform;
  projectPath: string; // GitLab group/sub/repo；GitHub owner/repo
  iid: number;
}

/** 行内评论负载 */
export interface MrComment {
  path: string;
  line: number; // 新版行号
  body: string;
}

/** 解析 MR/PR URL → 平台/项目/iid */
export function parseMrUrl(mrUrl: string, platform: ReviewPlatform): ParsedMrUrl {
  let url: URL;
  try {
    url = new URL(mrUrl);
  } catch {
    throw new BusinessException(ErrorCode.REVIEW_MR_URL_INVALID);
  }
  const origin = url.origin;

  if (platform === ReviewPlatform.GITLAB) {
    const m = url.pathname.match(/^(.+)\/-\/merge_requests\/(\d+)\/?$/);
    if (!m)
      throw new BusinessException(ErrorCode.REVIEW_MR_URL_INVALID, 'GitLab MR 链接格式不正确');
    return { origin, platform, projectPath: m[1].replace(/^\//, ''), iid: Number(m[2]) };
  }
  // GitHub: /owner/repo/pull/123
  const m = url.pathname.match(/^\/([^/]+\/[^/]+)\/pull\/(\d+)\/?$/);
  if (!m) throw new BusinessException(ErrorCode.REVIEW_MR_URL_INVALID, 'GitHub PR 链接格式不正确');
  return { origin, platform, projectPath: m[1], iid: Number(m[2]) };
}

async function httpJson(
  url: string,
  init: RequestInit & { headers: Record<string, string> },
): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * MR/PR 平台客户端：解析 refs（任务执行）+ 发布评论（回写）。
 * 凭证取自仓库 credential（user:token 的 token 部分；GitHub 支持 token 直存）。
 */
@Injectable()
export class MrIntegrationService {
  private readonly logger = new Logger(MrIntegrationService.name);

  constructor(private readonly crypto: ReviewCryptoService) {}

  private repoToken(repo: Pick<ReviewRepo, 'credentialEnc'>): string | null {
    if (!repo.credentialEnc) return null;
    const cred = this.crypto.decrypt(repo.credentialEnc);
    if (!cred) return null;
    // 形如 user:token 取 token；无冒号视为 token 本体
    const idx = cred.indexOf(':');
    return idx >= 0 ? cred.slice(idx + 1) : cred;
  }

  /** 解析 MR/PR 获取评审 refs */
  async resolveRefs(
    repo: Pick<ReviewRepo, 'platform' | 'credentialEnc'>,
    mrUrl: string,
  ): Promise<MrRefs> {
    const parsed = parseMrUrl(mrUrl, repo.platform);
    const token = this.repoToken(repo);
    return parsed.platform === ReviewPlatform.GITLAB
      ? this.resolveGitLab(parsed, token)
      : this.resolveGitHub(parsed, token);
  }

  private async resolveGitLab(parsed: ParsedMrUrl, token: string | null): Promise<MrRefs> {
    const project = encodeURIComponent(parsed.projectPath);
    const url = `${parsed.origin}/api/v4/projects/${project}/merge_requests/${parsed.iid}`;
    const data = (await httpJson(url, {
      headers: token ? { 'PRIVATE-TOKEN': token } : {},
    })) as {
      source_branch?: string;
      target_branch?: string;
      sha?: string;
      diff_refs?: { base_sha?: string; start_sha?: string; head_sha?: string };
      state?: string;
    };
    const fromRef = data.diff_refs?.base_sha || data.target_branch;
    const toRef = data.sha || data.source_branch;
    if (!fromRef || !toRef)
      throw new BusinessException(ErrorCode.REVIEW_MR_URL_INVALID, 'MR refs 解析不完整');
    return {
      platformProject: parsed.projectPath,
      mrIid: parsed.iid,
      fromRef,
      toRef,
      diffRefs: data.diff_refs
        ? {
            baseSha: data.diff_refs.base_sha ?? '',
            startSha: data.diff_refs.start_sha ?? '',
            headSha: data.diff_refs.head_sha ?? '',
          }
        : undefined,
    };
  }

  private async resolveGitHub(parsed: ParsedMrUrl, token: string | null): Promise<MrRefs> {
    const url = `${parsed.origin}/api/v3/repos/${parsed.projectPath}/pulls/${parsed.iid}`;
    // github.com 公共 API 路径不是 /api/v3（那是 GHE）；自动区分
    const finalUrl = parsed.origin.includes('github.com')
      ? `https://api.github.com/repos/${parsed.projectPath}/pulls/${parsed.iid}`
      : url;
    const data = (await httpJson(finalUrl, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    })) as {
      base?: { ref?: string; sha?: string };
      head?: { ref?: string; sha?: string };
    };
    const fromRef = data.base?.sha || data.base?.ref;
    const toRef = data.head?.sha || data.head?.ref;
    if (!fromRef || !toRef)
      throw new BusinessException(ErrorCode.REVIEW_MR_URL_INVALID, 'PR refs 解析不完整');
    return {
      platformProject: parsed.projectPath,
      mrIid: parsed.iid,
      fromRef,
      toRef,
      headSha: data.head?.sha,
    };
  }

  /**
   * 发布评审结果：行内评论（逐条 discussion/review comment）+ 汇总评论。
   * 返回汇总评论的链接；部分失败不抛错（记入返回值 note）。
   */
  async publish(
    repo: Pick<ReviewRepo, 'platform' | 'credentialEnc'>,
    parsed: ParsedMrUrl,
    comments: MrComment[],
    summary: string,
    diffRefs?: { baseSha: string; startSha: string; headSha: string },
    headSha?: string,
  ): Promise<{ noteUrl: string | null; inlineCount: number; inlineFailed: number }> {
    const token = this.repoToken(repo);
    return parsed.platform === ReviewPlatform.GITLAB
      ? this.publishGitLab(parsed, token, comments, summary, diffRefs)
      : this.publishGitHub(parsed, token, comments, summary, headSha);
  }

  private async publishGitLab(
    parsed: ParsedMrUrl,
    token: string | null,
    comments: MrComment[],
    summary: string,
    diffRefs?: { baseSha: string; startSha: string; headSha: string },
  ): Promise<{ noteUrl: string | null; inlineCount: number; inlineFailed: number }> {
    if (!token) throw new BusinessException(ErrorCode.CONFLICT, '仓库未配置访问凭证，无法回写');
    const project = encodeURIComponent(parsed.projectPath);
    const base = `${parsed.origin}/api/v4/projects/${project}/merge_requests/${parsed.iid}`;
    const headers = { 'PRIVATE-TOKEN': token, 'content-type': 'application/json' };

    let inlineCount = 0;
    let inlineFailed = 0;
    if (diffRefs) {
      for (const c of comments) {
        try {
          await httpJson(`${base}/discussions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              body: c.body,
              position: {
                position_type: 'text',
                base_sha: diffRefs.baseSha,
                start_sha: diffRefs.startSha,
                head_sha: diffRefs.headSha,
                new_path: c.path,
                new_line: c.line,
              },
            }),
          });
          inlineCount += 1;
        } catch (e) {
          inlineFailed += 1;
          this.logger.warn(`GitLab 行内评论失败 ${c.path}:${c.line}: ${(e as Error).message}`);
        }
      }
    }

    const note = (await httpJson(`${base}/notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: summary }),
    })) as { id?: number };
    const noteUrl = note?.id
      ? `${parsed.origin}/${parsed.projectPath}/-/merge_requests/${parsed.iid}#note_${note.id}`
      : null;
    return { noteUrl, inlineCount, inlineFailed };
  }

  private async publishGitHub(
    parsed: ParsedMrUrl,
    token: string | null,
    comments: MrComment[],
    summary: string,
    headSha?: string,
  ): Promise<{ noteUrl: string | null; inlineCount: number; inlineFailed: number }> {
    if (!token) throw new BusinessException(ErrorCode.CONFLICT, '仓库未配置访问凭证，无法回写');
    const base = parsed.origin.includes('github.com')
      ? `https://api.github.com/repos/${parsed.projectPath}/pulls/${parsed.iid}`
      : `${parsed.origin}/api/v3/repos/${parsed.projectPath}/pulls/${parsed.iid}`;
    const headers = {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
    };

    // GitHub 批量 review：一次提交带全部行内评论（line=新版行号, side=RIGHT）
    let inlineCount = 0;
    let inlineFailed = 0;
    if (comments.length) {
      if (!headSha) {
        inlineFailed = comments.length;
      } else {
        try {
          await httpJson(`${base}/reviews`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              commit_id: headSha,
              event: 'COMMENT',
              comments: comments.map((c) => ({
                path: c.path,
                line: c.line,
                side: 'RIGHT',
                body: c.body,
              })),
            }),
          });
          inlineCount = comments.length;
        } catch (e) {
          inlineFailed = comments.length;
          this.logger.warn(`GitHub 行内评论批量提交失败: ${(e as Error).message}`);
        }
      }
    }

    const issue = await httpJson(
      parsed.origin.includes('github.com')
        ? `https://api.github.com/repos/${parsed.projectPath}/issues/${parsed.iid}/comments`
        : `${parsed.origin}/api/v3/repos/${parsed.projectPath}/issues/${parsed.iid}/comments`,
      { method: 'POST', headers, body: JSON.stringify({ body: summary }) },
    );
    const noteUrl = (issue as { html_url?: string })?.html_url ?? null;
    return { noteUrl, inlineCount, inlineFailed };
  }
}
