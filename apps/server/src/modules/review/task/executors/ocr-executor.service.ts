import { ChildProcess, spawn } from 'node:child_process';

import { Injectable, Logger } from '@nestjs/common';

export interface OcrRunOptions {
  /** ocr 二进制路径 */
  bin: string;
  /** 附加在 bin 后的前缀参数（e2e/包装器场景：bin=node, argsPrefix=[fake-ocr.js]） */
  argsPrefix?: string[];
  /** 子命令参数（review --repo ... --format json ...） */
  args: string[];
  /** 工作目录（仓库工作区） */
  cwd: string;
  /** 任务级 HOME（OCR 会话/raw 捕获落点隔离） */
  homeDir: string;
  /** 模型配置注入（OCR_LLM_* 等） */
  env: Record<string, string>;
  timeoutMs: number;
  /** stdout/stderr 行回调（日志事件） */
  onLine?: (stream: 'stdout' | 'stderr', line: string) => void;
}

export interface OcrRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  cancelled: boolean;
}

interface ActiveEntry {
  child: ChildProcess;
  cancelRequested: boolean;
}

/**
 * OCR 子进程执行器：spawn + 行级日志 + 超时/取消（kill）。
 * 同进程持有活跃子进程 Map，cancel(taskId) 由 API 触发；
 * 取消用显式意图标记（Windows 上 kill 后 close 事件的 signal 可能为 null）。
 */
@Injectable()
export class OcrExecutorService {
  private readonly logger = new Logger(OcrExecutorService.name);
  private readonly active = new Map<string, ActiveEntry>();

  /** 取消执行中的任务；返回是否找到并 kill 了进程 */
  cancel(taskId: string): boolean {
    const entry = this.active.get(taskId);
    if (!entry) return false;
    entry.cancelRequested = true;
    entry.child.kill('SIGTERM');
    const killer = setTimeout(() => entry.child.kill('SIGKILL'), 10_000);
    entry.child.once('exit', () => clearTimeout(killer));
    return true;
  }

  isRunning(taskId: string): boolean {
    return this.active.has(taskId);
  }

  async run(taskId: string, opts: OcrRunOptions): Promise<OcrRunResult> {
    return new Promise<OcrRunResult>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...opts.env,
        HOME: opts.homeDir,
        USERPROFILE: opts.homeDir, // Windows 下 os.UserHomeDir() 读 USERPROFILE
      };

      // Windows：裸命令名（无路径分隔符）且非 .exe 时，npm 全局 bin 是 .cmd 批处理，
      // CreateProcess 不能直接执行批处理，需经 cmd.exe 中转（libuv 会安全 quote 参数）
      const isBareCmd = !opts.bin.includes('\\') && !opts.bin.includes('/');
      const useCmdShim =
        process.platform === 'win32' && isBareCmd && !/\.(exe|com)$/i.test(opts.bin);
      const spawnBin = useCmdShim ? 'cmd.exe' : opts.bin;
      const spawnArgs = useCmdShim
        ? ['/c', opts.bin, ...(opts.argsPrefix ?? []), ...opts.args]
        : [...(opts.argsPrefix ?? []), ...opts.args];

      let child: ChildProcess;
      try {
        child = spawn(spawnBin, spawnArgs, {
          cwd: opts.cwd,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (e) {
        reject(e);
        return;
      }

      const entry: ActiveEntry = { child, cancelRequested: false };
      this.active.set(taskId, entry);
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, opts.timeoutMs);

      const wireLines = (stream: NodeJS.ReadableStream | null, name: 'stdout' | 'stderr') => {
        if (!stream) return;
        let buf = '';
        stream.on('data', (chunk: Buffer) => {
          buf += chunk.toString('utf8');
          let idx: number;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).replace(/\r$/, '');
            buf = buf.slice(idx + 1);
            if (line.trim()) opts.onLine?.(name, line);
          }
        });
        stream.on('end', () => {
          if (buf.trim()) opts.onLine?.(name, buf);
        });
      };
      wireLines(child.stdout, 'stdout');
      wireLines(child.stderr, 'stderr');

      child.on('error', (err) => {
        clearTimeout(timer);
        this.active.delete(taskId);
        reject(err);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        this.active.delete(taskId);
        const cancelled = entry.cancelRequested;
        if (timedOut || cancelled) {
          this.logger.warn(
            `任务 ${taskId} 子进程结束: timedOut=${timedOut} cancelled=${cancelled} signal=${signal}`,
          );
        }
        resolve({ exitCode: code, signal, timedOut, cancelled });
      });
    });
  }
}
