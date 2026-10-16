/**
 * OCR `review --format json` 输出与 raw JSONL 的结构类型。
 * 字段以 open-code-review 源码为准：cmd/opencodereview/output.go、internal/llm/raw.go、internal/model/review.go。
 */

export interface OcrComment {
  path: string;
  content: string;
  suggestion_code?: string;
  existing_code?: string;
  start_line: number;
  end_line: number;
  thinking?: string;
  category?: string;
  severity?: string;
}

export interface OcrSummary {
  files_reviewed?: number;
  comments?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  elapsed?: string;
  budget_exceeded?: boolean;
}

export interface OcrToolCalls {
  total?: number;
  by_tool?: Record<string, number>;
  failure?: number;
}

export interface OcrManifestItem {
  path?: string;
  item_id?: string;
  status?: string; // reviewed | skipped | failed
  failure_class?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface OcrManifest {
  schema?: string;
  terminal_state?: string;
  items?: OcrManifestItem[];
  run_failure?: string | null;
  [key: string]: unknown;
}

export interface OcrResultJson {
  status: string; // success | completed_with_errors | failed | ...
  message?: string;
  summary?: OcrSummary;
  tool_calls?: OcrToolCalls;
  comments?: OcrComment[];
  warnings?: Array<{ file?: string; type?: string; message?: string }>;
  manifest?: OcrManifest;
  session_id?: string;
  llm?: { provider?: string; model?: string };
  trace_id?: string;
  project_summary?: string;
}

/** raw JSONL 每行（llm.RawRecord） */
export interface OcrRawRecord {
  session_id: string;
  request_id: string;
  timestamp: string;
  file_path?: string;
  task_type?: string;
  request_no?: number;
  trace_id?: string;
  model?: string;
  duration_ms?: number;
  status_code?: number;
  request_headers?: Record<string, string>;
  response_headers?: Record<string, string>;
  request_body?: unknown; // 完整请求体（messages 等）
  request_body_text?: string;
  response_body?: unknown; // 非流式完整响应
  response_body_text?: string; // 流式 SSE 文本
  error?: string;
}

/** 从 raw 记录中提取 token 用量（兼容 OpenAI/Anthropic usage 结构） */
export function extractUsage(rec: OcrRawRecord): {
  tokensIn: number | null;
  tokensOut: number | null;
} {
  const body = rec.response_body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') return { tokensIn: null, tokensOut: null };
  const usage = body.usage as Record<string, unknown> | undefined;
  if (!usage) return { tokensIn: null, tokensOut: null };
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return {
    tokensIn: num(usage.prompt_tokens) ?? num(usage.input_tokens),
    tokensOut: num(usage.completion_tokens) ?? num(usage.output_tokens),
  };
}
