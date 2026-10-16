import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * e2e 全局前置（先于所有模块加载）：
 * - ocr 指向 fake-ocr.js（无 LLM key 依赖）
 * - 评审工作区/任务 HOME 放临时目录，避免污染真实 workspace
 */
export default function setup(): void {
  const fakeOcr = path.resolve(__dirname, 'fake-ocr.js');
  process.env.OCR_BIN_PATH = process.execPath;
  process.env.OCR_BIN_ARGS_PREFIX = JSON.stringify([fakeOcr]);
  process.env.REVIEW_WORKSPACE_DIR = mkdtempSync(path.join(tmpdir(), 'nestreview-e2e-'));
  process.env.REVIEW_TASK_TIMEOUT_MS = '120000';
  process.env.REVIEW_WORKER_CONCURRENCY = '2';
}
