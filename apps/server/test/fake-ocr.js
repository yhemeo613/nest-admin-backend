/**
 * e2e 用 fake OCR：模拟 `ocr review --format json --output <file>`。
 * - 写 result.json（2 条评论 + summary + manifest + session_id）
 * - 写 raw JSONL（2 条 LLM 调用记录，含 usage/thinking）到 $HOME/.opencodereview/raw/e2e/
 * 真实 OCR 不参与（无 LLM key 依赖），验证平台任务全链路。
 */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const output = argOf('--output');
const home = process.env.HOME || process.env.USERPROFILE;

if (!output || !home) {
  console.error('[fake-ocr] missing --output or HOME');
  process.exit(1);
}

const sessionId = 'e2e-session-0001';
const rawDir = path.join(home, '.opencodereview', 'raw', 'e2e');
fs.mkdirSync(rawDir, { recursive: true });

const rawRecords = [
  {
    session_id: sessionId,
    request_id: 'req-1',
    timestamp: new Date().toISOString(),
    file_path: 'src/a.ts',
    task_type: 'MAIN_TASK',
    request_no: 1,
    model: process.env.OCR_LLM_MODEL || 'fake-model',
    duration_ms: 120,
    status_code: 200,
    request_body: {
      model: 'fake-model',
      messages: [
        { role: 'system', content: 'You are a code reviewer.' },
        { role: 'user', content: 'Review src/a.ts diff...' },
      ],
    },
    response_body: {
      choices: [{ message: { role: 'assistant', content: '{"comments":[...]}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 42 },
    },
  },
  {
    session_id: sessionId,
    request_id: 'req-2',
    timestamp: new Date().toISOString(),
    file_path: 'src/b.ts',
    task_type: 'MAIN_TASK',
    request_no: 2,
    model: process.env.OCR_LLM_MODEL || 'fake-model',
    duration_ms: 80,
    status_code: 200,
    request_body: { model: 'fake-model', messages: [{ role: 'user', content: 'Review src/b.ts...' }] },
    response_body: {
      choices: [
        {
          message: {
            role: 'assistant',
            reasoning_content: '这段代码命名需要改进，因为……（思维链）',
            content: '{"comments":[...]}',
          },
        },
      ],
      usage: { prompt_tokens: 60, completion_tokens: 20 },
    },
  },
];
fs.writeFileSync(
  path.join(rawDir, `${sessionId}.jsonl`),
  rawRecords.map((r) => JSON.stringify(r)).join('\n') + '\n',
  'utf8',
);

const result = {
  status: 'success',
  session_id: sessionId,
  llm: { provider: 'openai', model: process.env.OCR_LLM_MODEL || 'fake-model' },
  summary: {
    files_reviewed: 2,
    comments: 2,
    total_tokens: 222,
    input_tokens: 160,
    output_tokens: 62,
    elapsed: '1s',
  },
  tool_calls: { total: 3, by_tool: { file_read: 2, code_search: 1 }, failure: 0 },
  comments: [
    {
      path: 'src/a.ts',
      start_line: 1,
      end_line: 3,
      content: '变量 `data` 可能为 undefined，直接访问 `.length` 会抛错。',
      category: 'bug',
      severity: 'critical',
      thinking: '检查到 data 来源未判空……',
      suggestion_code: 'if (data?.length) { ... }',
      existing_code: 'data.length',
    },
    {
      path: 'src/b.ts',
      start_line: 10,
      end_line: 10,
      content: '函数名 `doit` 语义不清，建议改为具体动作名。',
      category: 'maintainability',
      severity: 'low',
    },
  ],
  manifest: {
    schema: 'ocr.run-manifest/v1',
    terminal_state: 'completed',
    items: [
      { path: 'src/a.ts', status: 'reviewed' },
      { path: 'src/b.ts', status: 'reviewed' },
    ],
  },
};

fs.writeFileSync(output, JSON.stringify(result, null, 2), 'utf8');
console.log('[fake-ocr] review done, comments=2');
process.exit(0);
