import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { Logger } from '@nestjs/common';

import { OcrRawRecord } from '../parsers/ocr-types';

export interface RawLineEntry {
  /** JSONL 文件路径 */
  filePath: string;
  /** 行起始字节偏移 */
  offset: number;
  /** 行字节数（含换行） */
  length: number;
  record: OcrRawRecord;
}

interface FileCursor {
  /** 下次读取起点（字节） */
  offset: number;
  /** 未对齐一行的残留字节（Buffer 级保存，避免 UTF-8 多字节字符跨 chunk 截断产生偏移漂移） */
  pending: Buffer;
}

const NEWLINE = 0x0a;

/**
 * raw JSONL 增量尾随器：轮询 $HOME/.opencodereview/raw/<repo>/*.jsonl，
 * 按行产出新记录（含精确字节偏移，供 ReviewTraceCall 落库后按需回放完整记录）。
 */
export class RawTailer {
  private readonly logger = new Logger(RawTailer.name);
  private readonly rawRoot: string;
  private readonly cursors = new Map<string, FileCursor>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    homeDir: string,
    private readonly onEntry: (entry: RawLineEntry) => void,
    private readonly intervalMs = 500,
  ) {
    this.rawRoot = path.join(homeDir, '.opencodereview', 'raw');
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick().catch(() => undefined), this.intervalMs);
    void this.tick().catch(() => undefined);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // 收尾再读一次，保证最后写入的行不丢
    await this.tick().catch(() => undefined);
  }

  /** 当前已发现的所有 raw 文件（任务结束时用于 TraceCall 的 rawPath） */
  getKnownFiles(): string[] {
    return [...this.cursors.keys()];
  }

  private async tick(): Promise<void> {
    let dirs: string[];
    try {
      dirs = await readdir(this.rawRoot);
    } catch {
      return; // raw 目录尚未创建（任务早期）
    }
    for (const dir of dirs) {
      const dirPath = path.join(this.rawRoot, dir);
      let files: string[];
      try {
        if (!(await stat(dirPath)).isDirectory()) continue;
        files = await readdir(dirPath);
      } catch {
        continue;
      }
      for (const f of files) {
        if (f.endsWith('.jsonl')) await this.readNewLines(path.join(dirPath, f));
      }
    }
  }

  private async readNewLines(filePath: string): Promise<void> {
    let fh;
    try {
      fh = await open(filePath, 'r');
    } catch {
      return;
    }
    try {
      let cursor = this.cursors.get(filePath);
      if (!cursor) {
        cursor = { offset: 0, pending: Buffer.alloc(0) };
        this.cursors.set(filePath, cursor);
      }
      const size = (await fh.stat()).size;
      if (size <= cursor.offset) return; // 无新增（含截断重启的保守处理）

      const readLen = size - cursor.offset;
      const buf = Buffer.alloc(readLen);
      await fh.read(buf, 0, readLen, cursor.offset);
      const chunkStart = cursor.offset;
      cursor.offset = size;

      const combined = Buffer.concat([cursor.pending, buf]);
      const pendingLen = cursor.pending.length;
      let start = 0;
      let idx: number;
      while ((idx = combined.indexOf(NEWLINE, start)) >= 0) {
        let end = idx;
        if (end > start && combined[end - 1] === 0x0d) end -= 1; // \r\n
        const line = combined.subarray(start, end);
        const lineOffset = chunkStart - pendingLen + start;
        const lineLen = idx - start + 1; // 含 \n
        if (line.length > 0) {
          try {
            const record = JSON.parse(line.toString('utf8')) as OcrRawRecord;
            this.onEntry({ filePath, offset: lineOffset, length: lineLen, record });
          } catch {
            // 单行损坏不阻塞后续行
          }
        }
        start = idx + 1;
      }
      cursor.pending = combined.subarray(start);
    } finally {
      await fh.close().catch(() => undefined);
    }
  }
}
