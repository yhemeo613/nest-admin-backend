# NestReview — AI 代码评审平台设计文档

> 基于 [alibaba/open-code-review](https://github.com/alibaba/open-code-review)（Go CLI，Apache-2.0）产品化的全自动、可视化、可追踪代码评审系统。
> 宿主：本 monorepo（NestJS 后端 `apps/server` + Vue3 管理端 `apps/web` + 共享契约 `packages/contracts`）。
> 版本：v1.0（2026-10）。对应实现里程碑 M1–M7。

---

## 1. 产品定位与价值

把 OCR 这个"本地 CLI 评审引擎"升级为团队级评审平台：

1. **全自动**：任务进队列 → 自动 clone/fetch → 自动执行 OCR → 自动解析入库 → 自动评估质量红线 → 自动回写 MR 评论区 → 自动通知（本期触发为手动创建，架构为 webhook 触发预留同一入口）。
2. **可视化**：Dashboard 趋势/分布报表、任务 diff 视图、行级发现卡片、质量红线结论。
3. **可追踪**：状态机全链路、每次 LLM 调用落盘索引（执行轨迹）、manifest 覆盖率、发现的跨任务指纹生命周期。
4. **AI 思维链**：OCR 的 raw JSONL 捕获（完整 request/response/thinking/tool 调用）回放为时间线 + 消息流视图；评论自带 thinking 折叠展示；运行中实时推送。

### 分期

| 期               | 内容                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| P0               | 模型配置、仓库管理、手动触发、任务队列、任务详情（发现/diff/思维链/覆盖率）、SSE 实时、质量红线、评论生命周期、Dashboard |
| P1               | MR/PR 自动回写、通知中心、任务重跑/取消                                                                                  |
| P2（不做，留点） | webhook 自动触发、OCR `--resume` 断点续跑、MCP 工具、scan 模式、多实例分布式 tail                                        |

---

## 2. OCR 引擎集成事实（实现依据）

| 事实                                                                                                                       | 依据                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `ocr review --from <base> --to <head> / --commit <sha> --format json --output <file>`                                      | `cmd/opencodereview/review_cmd.go`、`output.go`                      |
| JSON 输出含 `status/summary/tool_calls/comments/groups/manifest/session_id`                                                | `cmd/opencodereview/output.go:337 jsonOutput`                        |
| 评论含 `path/start_line/end_line/content/thinking/category/severity/suggestion_code/existing_code`                         | `internal/model/review.go:8 LlmComment`                              |
| 每次 LLM 调用完整捕获到 `$HOME/.opencodereview/raw/<repo>/<session>.jsonl`                                                 | `internal/session/raw_writer.go`、`internal/llm/raw.go:36 RawRecord` |
| 模型全 env 注入：`OCR_LLM_URL/TOKEN/MODEL/PROTOCOL/AUTH_HEADER/EXTRA_HEADERS/TIMEOUT`                                      | `internal/llm/resolver.go:57-72`                                     |
| `HOME` 决定配置与捕获落点 → 任务级隔离只需注入 `HOME`                                                                      | `os.UserHomeDir()` 使用点                                            |
| manifest `ocr.run-manifest/v1`：每文件 `reviewed/skipped/failed + failure_class`                                           | `internal/session/manifest.go`                                       |
| category 枚举：bug/security/performance/maintainability/test/style/documentation/other；severity：critical/high/medium/low | `internal/model/review.go`                                           |
| thinking / reasoning_content 流式支持                                                                                      | `internal/llm/client.go`                                             |

集成方式结论：**不改 OCR 源码**，以子进程方式调用，环境变量注入配置，`HOME` 隔离会话，解析 stdout JSON 与 raw JSONL。

---

## 3. 系统架构

```
[前端 :3006]                            [后端 :3000 NestJS]
 新建评审 POST /api/v1/review/tasks ──▶ ReviewTaskService.create()
                                          │ BullMQ Queue "review"
                                          ▼
                                  ReviewWorker (并发可配)
                                  ① 准备工作区 apps/server/workspaces/review/repos/{repoId}
                                     git clone/fetch（凭证注入 remote URL）
                                  ② 任务工作区 workspaces/review/tasks/{taskId}
                                     HOME=该目录；构建 OCR_LLM_* env
                                  ③ spawn: ocr review --from..to --format json --output result.json
                                     ├─ tail HOME/.opencodereview/raw/**/*.jsonl
                                     │   → 逐行解析 → Redis pub/review:task:{id}
                                     │   → SSE Controller → 前端轨迹时间线（实时）
                                     └─ stdout/stderr → 日志事件
                                  ④ 进程退出 → 解析 result.json + manifest + git diff 落盘
                                  ⑤ gate 评估 → findings 入库（指纹去重）→ 通知事件
                                  ⑥ 任务配了 MR/PR 链接 → 回写客户端发布评论 → 通知
[前端] GET /api/v1/review/tasks/:id/events (SSE) ◀── 订阅 Redis channel
```

### 3.1 任务状态机

```
PENDING ──enqueue──▶ PREPARING ──▶ RUNNING ──▶ EVALUATING ──▶ SUCCESS
   │                    │              │            │
   └── cancel ──▶ CANCELLED ◀──────────┴────────────┘（任意活跃态可取消）
                    任意阶段异常 ──▶ FAILED
```

- `stage` 细粒度（PREPARING/RUNNING/EVALUATING/PUBLISHING 内的子步骤）+ `progress` 0–100，SSE 推送。
- `gateStatus`: `PASS / FAIL / SKIPPED`（未配置规则或任务未产评论）。

### 3.2 实时通道

- worker 内部事件 → `Redis.publish('review:task:{id}', JSON.stringify(SseEvent))`。
- SSE Controller：`@Sse()` + `fromEvent`，RxJS 订阅 Redis；鉴权走 fetch-SSE 客户端带 `Authorization` header（前端自写 `utils/sse.ts`，不用原生 EventSource）。
- 事件类型：
  ```ts
  type SseEvent =
    | { type: 'stage'; stage: string; progress: number; message?: string }
    | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; ts: string }
    | { type: 'trace_call'; call: TraceCallSummary } // raw 逐行解析出的调用摘要
    | { type: 'finding'; finding: FindingBrief } // 完成后一次性
    | { type: 'finished'; status: TaskStatus; gateStatus?: GateStatus };
  ```

### 3.3 执行细节

- **OCR 二进制**：env `OCR_BIN_PATH`（默认 `ocr`）。Windows 开发机 `npm i -g @alibaba-group/open-code-review`；Docker 构建阶段安装。
- **命令拼装**（M4 以 `ocr review --help` 实测为准）：
  - RANGE：`ocr review --from <base> --to <head> --format json --output result.json`
  - COMMIT：`ocr review --commit <sha> --format json --output result.json`
  - MR：先经平台 API 解析出 `source_branch/target_branch`（或 head/base sha），转 RANGE 执行。
- **环境注入**：`HOME={taskDir}`、`OCR_BIN_PATH` 透传、`OCR_LLM_URL/TOKEN/MODEL/PROTOCOL`（+可选 `EXTRA_HEADERS`）来自所选 ReviewModel。
- **超时**：默认 30min（env `REVIEW_TASK_TIMEOUT_MS`），超时 SIGKILL → FAILED(timeout)。
- **取消**：记录子进程 PID，`cancel()` 时 kill 进程树 → CANCELLED。
- **diff**：执行时 `git diff {from}..{to} > taskDir/diff.patch`（COMMIT 模式 `git show <sha>`），存盘供前端渲染。

### 3.4 安全

- 模型 apiKey / git 凭证 / 平台 token：AES-256-GCM 加密（env `REVIEW_CRYPTO_KEY`，Joi 校验必填）。
- 任务目录权限 0700（raw 捕获含完整 prompt）。
- 读取 trace/diff 原始文件的接口全部过权限码；OCR 子进程不在请求线程。

---

## 4. 数据模型（Prisma，PostgreSQL）

通用约定：`id uuid`、`createdAt/updatedAt/deletedAt` 软删除、表 `snake_case @@map`、`createdBy` 关联发起人。

```prisma
enum ReviewPlatform  { GITLAB GITHUB }
enum ReviewTaskMode  { RANGE COMMIT MR }
enum ReviewTaskStatus{ PENDING PREPARING RUNNING EVALUATING SUCCESS FAILED CANCELLED }
enum ReviewGateStatus{ PASS FAIL SKIPPED }
enum ReviewFindingStatus { OPEN FIXED IGNORED RESOLVED }
enum ReviewNotifType { TASK_FINISHED TASK_FAILED GATE_FAILED }

model ReviewRepo {          // 仓库
  name, platform, gitUrl(unique), defaultBranch,
  credentialEnc(String?)    // HTTPS 凭证/user:token 密文
  workspaceStatus(String)   // NONE|READY|ERROR
  lastSyncAt, createdBy
}
model ReviewModel {         // 模型配置
  name, provider, protocol(anthropic|openai|openai-responses),
  baseUrl, apiKeyEnc, model, extraBody(Json?), isDefault, status, createdBy
}
model ReviewTask {          // 评审任务
  repoId, modelId?, mode, fromRef?, toRef?, commitSha?,
  mrUrl?, mrIid?, platformProject?, mrState(String?)   // 回写状态
  requirementBackground?
  status, stage, progress
  sessionId?, resultPath?, diffPath?, rawPath?, homeDir?
  gateStatus, gateDetail(Json?)
  stats(Json?)   // { filesReviewed, comments, inputTokens, outputTokens, totalTokens, elapsed, toolCalls }
  error?, startedAt?, finishedAt?, createdBy
}
model ReviewFinding {       // 发现（评论）
  taskId, path, startLine, endLine, content, thinking?,
  category, severity, suggestionCode?, existingCode?,
  fingerprint(String)       // sha256(path|category|归一化content)
  status, isNew, firstSeenTaskId?, lastSeenTaskId?, resolvedAt?
}
model ReviewTraceCall {     // LLM 调用索引（raw 本体留在 JSONL，按 offset 读）
  taskId, seq, requestNo?, taskType?, filePath?, model?,
  durationMs, statusCode?, tokensIn?, tokensOut?,
  rawPath, rawOffset, rawLen
}
model ReviewGateRule {      // 质量红线（repoId 空 = 全局默认）
  repoId?, maxCritical?, maxHigh?, createdBy
}
model ReviewNotif {         // 站内通知
  userId?(空=全员), type, taskId, title, content, isRead, readAt?
}
```

`SysPermission` 增列 `isHidden Boolean @default(false)` —— 详情页等隐藏路由。

### 4.1 发现指纹与生命周期

- `fingerprint = sha256(normalize(path) + '|' + category + '|' + normalize(strip(content)))`
- 任务入库时：同 repo 历史 OPEN findings 按 fingerprint 匹配 → 命中则更新 `lastSeenTaskId`、`isNew=false`；未命中 → 新建、`isNew=true`、`firstSeenTaskId=taskId`。
- 状态流转：`OPEN → FIXED/IGNORED → (重新打开) OPEN`；FIXED 记 `resolvedAt`。
- 修复率 = 周期内 FIXED / 曾 OPEN 数。

---

## 5. API 契约（`/api/v1`）

出参本体（全局拦截器包壳）；分页 `{ list, total, page, pageSize }`。

| 方法                | 路径                                           | 权限码                                      | 说明                                        |
| ------------------- | ---------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| POST                | `/review/tasks`                                | `review:task:create`                        | 创建任务入队                                |
| GET                 | `/review/tasks`                                | `review:task:list`                          | 分页（`@DataScope ownerField=createdBy`）   |
| GET                 | `/review/tasks/:id`                            | `review:task:detail`                        | 详情+stats+gate                             |
| POST                | `/review/tasks/:id/cancel`                     | `review:task:cancel`                        | 取消                                        |
| POST                | `/review/tasks/:id/rerun`                      | `review:task:rerun`                         | 同参重跑                                    |
| POST                | `/review/tasks/:id/publish`                    | `review:task:publish`                       | 触发/重试 MR 回写                           |
| GET                 | `/review/tasks/:id/events`                     | 登录（SSE Guard）                           | 实时事件流                                  |
| GET                 | `/review/tasks/:id/diff`                       | `review:task:detail`                        | diff.patch（text/plain）                    |
| GET                 | `/review/tasks/:id/findings`                   | `review:task:detail`                        | 发现（筛选 severity/category/status/isNew） |
| PATCH               | `/review/findings/:id`                         | `review:finding:update`                     | 状态流转                                    |
| GET                 | `/review/tasks/:id/trace/calls`                | `review:task:detail`                        | 轨迹索引                                    |
| GET                 | `/review/tasks/:id/trace/call/:seq`            | `review:task:detail`                        | 单次完整 raw 记录                           |
| GET                 | `/review/tasks/:id/manifest`                   | `review:task:detail`                        | 覆盖率                                      |
| GET                 | `/review/tasks/:id/gate`                       | `review:task:detail`                        | 红线结论（供 CI 查询）                      |
| GET/POST/PUT/DELETE | `/review/repos...`、`/review/repos/:id/sync`   | `review:repo:list/create/edit/delete/sync`  | 仓库 CRUD+同步                              |
| GET/POST/PUT/DELETE | `/review/models...`、`/review/models/:id/test` | `review:model:list/create/edit/delete/test` | 模型 CRUD+连通测试                          |
| GET/POST/PUT/DELETE | `/review/gates...`                             | `review:gate:list/edit`                     | 红线规则                                    |
| GET                 | `/review/dashboard/stats`                      | `review:dashboard:query`                    | 报表聚合                                    |
| GET/PATCH           | `/review/notifications...`                     | 登录                                        | 通知列表/已读                               |

### 权限码（contracts 唯一事实来源，三段式）

```
review:dashboard:query
review:task:list / detail / create / cancel / rerun / publish
review:finding:update
review:repo:list / create / edit / delete / sync
review:model:list / create / edit / delete / test
review:gate:list / edit
```

---

## 6. 前端 UI/交互

### 6.1 菜单（后端 seed 驱动；详情页 isHidden）

```
代码评审（DIR）
├── 评审工作台   /review/dashboard
├── 评审任务     /review/task
│   └── 任务详情 /review/task/detail   ← isHidden
├── 仓库管理     /review/repo
├── 模型配置     /review/model
└── 质量红线     /review/gate
```

### 6.2 页面

1. **工作台**：统计卡（30 天任务数/完成率、OPEN 问题、红线通过率、token 消耗）+ severity 趋势折线 + category 环图 + 每日 token 柱状 + 最近任务表。
2. **任务列表**：筛选（状态/仓库/时间/红线）；「新建评审」弹窗（仓库 → 模式联动[分支区间/commit/MR 链接] → 需求背景 → 模型）；行操作详情/重跑/取消（`v-auth`）。
3. **任务详情**（核心）：
   - 头部：状态机徽标 + 实时进度条（SSE）、耗时/token/模型、gate 大徽标、重跑/回写按钮。
   - Tab 发现：severity/category/状态/仅新增筛选；卡片流 = severity 色条 + category + `文件:行` 锚点 + Markdown 内容 + **AI 思维链折叠块** + 修复建议 diff + 状态操作；点行号跳 Diff Tab 高亮。
   - Tab Diff：diff2html side-by-side 渲染 diff.patch，finding 角标锚点。
   - Tab 执行轨迹：调用时间线（序号/taskType/文件/model/tokens/耗时）→ 展开完整消息流（角色分色、thinking 折叠、工具调用 JSON）；运行中 SSE 实时插入。
   - Tab 覆盖率：manifest 文件表（reviewed/skipped/failed/failure_class）。
4. **仓库管理**：CRUD + 凭证密文 + 同步。
5. **模型配置**：CRUD（provider 预设/protocol/baseUrl/apiKey/model/extraBody）+ 连通测试 + 设默认。
6. **质量红线**：全局默认 + 每仓库覆盖（maxCritical/maxHigh，空=不限）。
7. **通知**：头部铃铛接入（SSE 即时 + 未读数 + 全部已读）。

### 6.3 交互要点

- 运行中详情页 SSE 驱动自动刷新；离开页面断连；`?tab=` 同步。
- 前端三坑规避：`g-*` 不叠 `dark:`；flex 链逐层 `min-h-0`；`art-full-height` 子滚动容器自 `overflow-auto + min-h-0`。
- 新增依赖：`diff2html`（web）；markdown 渲染用已有 markdown-it + highlight.js 自包组件。

---

## 7. 实施里程碑（对应本次交付）

| 里程碑 | 内容                                                              | 验证                             |
| ------ | ----------------------------------------------------------------- | -------------------------------- |
| M1     | 本设计文档                                                        | 评审                             |
| M2     | contracts 权限码 + Prisma 迁移 + seed 菜单/权限 + 错误码/事件常量 | 全仓 lint/typecheck/test + seed  |
| M3     | 模型/仓库/红线 CRUD + 加密服务                                    | 三件套 + http 用例               |
| M4     | 任务队列/Worker/OCR 执行器/解析器/SSE/发现入库/gate               | 三件套 + build + e2e（fake ocr） |
| M5     | MR 回写（GitLab/GitHub）+ 通知 + Dashboard 统计                   | 三件套 + build                   |
| M6     | 前端类型/API/组件/5 页面/通知铃铛                                 | web lint + build                 |
| M7     | 全仓验证 + README/Dockerfile 回流                                 | 全绿 + 手动联调清单              |

---

## 8. 部署与配置

| 变量                        | 说明                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `OCR_BIN_PATH`              | ocr 二进制路径（默认 PATH 中 `ocr`）                          |
| `REVIEW_CRYPTO_KEY`         | AES-256-GCM 密钥（32 字节 hex，必填，入 env.validation）      |
| `REVIEW_WORKSPACE_DIR`      | 工作区根（默认 `apps/server/workspaces/review`，Docker 挂卷） |
| `REVIEW_TASK_TIMEOUT_MS`    | 单任务超时（默认 1800000）                                    |
| `REVIEW_WORKER_CONCURRENCY` | worker 并发（默认 1，视 LLM 配额调）                          |

- Docker：runner 阶段安装 OCR 二进制 + `git`；挂载 workspace 卷。
- 服务器联调：建模型 → 建仓库 → 创建任务（分支区间）→ 观察实时进度/思维链 → Findings/diff → 配 MR 链接回写 → 通知/报表核对。

---

## 9. 扩展点（P2）

- **webhook 触发**：新增 `POST /review/webhooks/:platform`（签名校验）→ 复用 `POST /review/tasks` 的 Service 入口。
- **断点续跑**：任务失败时记录 `sessionId`，重跑参数带 `--resume`。
- **多实例**：raw tail 结果已归一为 Redis 事件，多实例天然共享；trace 按 `rawPath` 落共享卷。
