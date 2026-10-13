# SaaS AI 客服系统 · 产品闭环规划

> 版本：v1.0（2026-10-13）
> 性质：产品规划与技术方案文档，指导后续 P1–P4 迭代；实施时以 AGENTS.md 规范为准。
> 关联文档：[架构设计方案.md](./架构设计方案.md)（框架级设计）、`AGENTS.md`（编码规范）

---

## 一、产品定位与价值闭环

### 1.1 一句话定位

**多租户 SaaS 平台**：企业客户自助开通租户 → 导入自己的业务知识 → 一段代码把 AI 客服挂到自己的网站/公众号 → AI 自动应答降本增效 → 答不了的转人工 → 运营看数据持续优化 → 按用量付费。

### 1.2 价值闭环

```
┌────────┐   ┌────────────┐   ┌──────────────┐   ┌──────────────┐
│ 租户接入 │ → │ 知识库构建   │ → │ 渠道挂载       │ → │ AI 自动应答    │
│ (API Key)│   │ (文章+TAG)  │   │ (挂件/SEO/API)│   │ (知识增强回答) │
└────────┘   └────────────┘   └──────────────┘   └──────┬───────┘
       ↑                                                │ 答不了
       │         ┌────────────┐   ┌──────────────┐      ↓
       │ 按量计费 │ 运营数据报表 │ ← │ 转人工/工单    │ ←──┘
       └─────── │ (P3 套餐)   │   │ (P2 坐席工作台)│
                 └────────────┘   └──────────────┘
```

### 1.3 三类角色、三端职责

| 角色     | 端                                      | 核心诉求                           | 当前状态                                  |
| -------- | --------------------------------------- | ---------------------------------- | ----------------------------------------- |
| C 端访客 | 网页挂件 / 帮助中心（SEO 页）/ 开放 API | 提问得到准确回答；答不了能找到人   | 挂件与 SEO 页 **缺失（本文档 P1 补齐）**  |
| B 端租户 | 管理后台（`web/`）                      | 配知识库、看会话、调机器人、看报表 | 租户/会话/模型配置已建成；知识库 **缺失** |
| 平台运营 | 同一后台（平台域功能）                  | 管租户、管套餐、看成本营收         | 租户管理已建成；套餐计费 **P3**           |

---

## 二、现状盘点（基于代码事实，2026-10-13）

### 2.1 已建成的资产

| 域           | 内容                                                                                                                                                                                                                 | 位置                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 多租户地基   | `tenant`（软删/编码唯一）、`tenant_api_key`（明文仅返回一次，库存 sha256）、`tenant_conversation`、`tenant_message`（冗余 tenantId）                                                                                 | `prisma/schema.prisma`、迁移 `20261013055955_saas_tenant` |
| 访客对话     | `POST /saas/visitor/chat/stream`（X-Api-Key 鉴权、SSE、首帧回传 conversationId、断连保留部分回答、限流 30/min）                                                                                                      | `src/modules/saas/visitor-chat.*`                         |
| 会话查询     | 管理端会话分页/详情（`saas:conversation:*`）                                                                                                                                                                         | `src/modules/saas/conversation.*`                         |
| AI 基建      | LangChain 1.x 架构：`AiRegistry`（DB 模型配置 → ChatOpenAI/ChatOllama 实例）、`AiGateway`（流式/降级/审计门面）、`AiAgentService`（createAgent + 工具循环 + 权限折叠）、`AiUsageHandler`（每次调用落 `ai_call_log`） | `src/infra/ai/`                                           |
| 知识注入能力 | 9 个管理端工具（zod schema）、prompt 模板机制（`prompts/{场景}.v{N}.md`）、`embeddings()` 已预埋                                                                                                                     | `src/modules/ai-chat/ai-tools.service.ts`                 |
| 管理端页面   | 登录、工作台、AI 问答、模型配置、用量报表、用户/角色/权限/部门、租户管理（含 API Key）、访客会话、快捷入口（已产品化）                                                                                               | `web/src/views/`                                          |
| 规范         | 权限三步走、统一响应、`v-auth` 与后端同源、SSE 帧契约 `{delta, done, tool, usage, model}`                                                                                                                            | `AGENTS.md`                                               |

### 2.2 已确认的缺口（附证据）

| #   | 缺口                                                                                                                                          | 证据                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | **个人中心是模板占位**：资料卡硬编码（`jdkjjfnndf@mall.com`、"字节跳动－UED"等假数据）；"基本设置/更改密码"表单只切换编辑态，**零后端调用**   | `web/src/views/system/user-center/index.vue`（247 行，无 `import ... api/`） |
| 2   | **后端无自助接口**：`system/users` 全部是管理员操作（`:id` 参数化 + 权限码）；`auth` 只有 `GET /auth/profile` 只读，无"改自己资料/改自己密码" | `user.controller.ts` / `auth.controller.ts` 路由清单核查                     |
| 3   | **无知识库**：`schema.prisma` 15 个 model 中无任何 kb/article/tag 表；权限码无 `saas:kb:*`                                                    | schema 与 `permission-code.ts` 全量核查                                      |
| 4   | **无 C 端公开页**：`main.ts`/`app.module.ts` 无 ServeStaticModule/express.static；`package.json` 无模板引擎依赖                               | 全文 grep 零命中                                                             |
| 5   | **无网页挂件**：无 widget 路由/JS；但访客 SSE 接口已就绪，`web/src/utils/sse-chat.ts` 有可复用的帧解析实现                                    | `src/modules/saas/` 文件清单                                                 |
| 6   | **检索约束**：pgvector 在 migrations 中零使用先例；MiMo provider 无 embedding 接口（实测）                                                    | migration.sql grep；MiMo 接入记录                                            |

### 2.3 结论

地基（多租户 + AI + 会话）已牢，缺的是**产品闭环的中段**：知识生产（管理端）→ 知识消费（C 端展示 + 挂件问答）。本文档 P1 部分即补齐这一段。

---

## 三、方案设计（四个缺口）

### 3.1 个人中心（P1a）

**目标**：把模板占位页换成真实自助服务。

**后端**（`auth` 模块，登录即可，无需权限码——个人收件箱语义，与通知接口同理）：

| 接口                 | 入参                      | 说明                                                                                                    |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `PUT /auth/profile`  | nickname / email / phone  | 更新自己的资料；同步刷新 Redis 用户缓存（`CacheKey.userInfo`），改昵称即时生效                          |
| `PUT /auth/password` | oldPassword / newPassword | 校验旧密码（argon2 verify）→ 改密 → **删除 Redis 刷新令牌（强制下线）+ 清用户缓存**；返回后前端跳登录页 |

- 入参 DTO 走 class-validator + `@ApiProperty`；改密复用现有 `ResetPasswordDto` 的强度校验规则（6-64 位）。
- 新错误码：`OLD_PASSWORD_WRONG = 10005`（用户域）。

**前端**：重写 `web/src/views/system/user-center/index.vue`：

- 左侧资料卡：真实头像（P1 用首字母占位，不做上传）、用户名（只读）、部门、角色标签；删除全部硬编码假数据。
- 基本设置：昵称/邮箱/手机号 → 调 `PUT /auth/profile`，保存成功后刷新 `userStore.info`。
- 更改密码：当前/新/确认 → 调 `PUT /auth/password` → 成功提示后自动跳登录（走 `userStore.logOut()`）。
- API 层：`web/src/api/auth.ts` 增加 `fetchUpdateProfile` / `fetchChangePassword`；类型进 `Api.Auth` 命名空间。

**验收**：改昵称 → 刷新页面/顶部用户菜单即时更新；改密码 → 当前会话被强制下线、旧密码登录失败、新密码登录成功。

### 3.2 知识库 + TAG（P1b）

**目标**：租户能建知识库、写文章、打标签，为挂件问答与 SEO 页提供内容源。

**数据模型**（沿用通用字段约定 `id/createdAt/updatedAt/deletedAt`，表名 `saas_` 前缀）：

```prisma
model SaasKb {              // 知识库（租户可多库，如"售后政策库""产品手册库"）
  id, tenantId, name, description?, sort, status(Status)
  articles SaasKbArticle[]
  tags     SaasKbTag[]
}

model SaasKbArticle {       // 文章（同时是 SEO 页与检索的内容单元）
  id, kbId, tenantId(冗余便于行级过滤)
  title, slug @unique(per kb，URL 友好标识), content @db.Text(Markdown)
  status: DRAFT/PUBLISHED/ARCHIVED
  seoTitle?, seoDescription?        // SEO 页 <title>/meta description，缺省回填 title/摘要
  publishedAt?
  viewCount Int @default(0)         // SEO 页浏览计数（运营指标）
  tags SaasKbArticleTag[]
}

model SaasKbTag {           // 标签（租户内按名称唯一）
  id, kbId, name
}

model SaasKbArticleTag {    // 文章-标签多对多
  articleId, tagId  @@id([articleId, tagId])
}
```

**后端**：`src/modules/saas/kb/`（同一 SaasModule 下新子域，Controller→Service→Prisma 分层）：

- `GET /saas/kbs`、POST、PUT、DELETE（软删，连带失效其下文章）—— `saas:kb:list|create|update|delete`
- `GET /saas/kbs/:id/articles`（分页 + keyword/status/tagId 过滤）、POST、PUT、DELETE —— `saas:kb:article:list|create|update|delete`；slug 冲突校验（同库唯一）
- `GET/POST/DELETE /saas/kbs/:id/tags` —— `saas:kb:tag:list|create|delete`
- 权限码三步走：`permission-code.ts` → `seed.ts` PERMISSION_TREE → `pnpm prisma:seed`（两个库都跑）
- **站内检索服务** `KbSearchService`（供挂件问答注入，也供管理端预览）：把用户问题拆词 → 对已发布文章 `title/content ILIKE` OR 过滤（kbId 可选）→ 按命中次数+发布时间排序 → Top-N（默认 3，每篇截断 1500 字）。接口内部复用，不单独暴露。

**前端**：`web/src/views/saas/kb/`（对齐 `views/system/user` 成熟范式）：

- `index.vue`：知识库列表（库管理 CRUD + 进入文章）
- `article/index.vue`：文章列表（状态/标签过滤、发布/下线）+ `article/edit.vue`：Markdown 编辑器（用模板里已有的 md 编辑组件，若无则用轻量 textarea + 预览，避免引大依赖）
- TAG 管理内嵌在库页签中
- 按钮全部 `v-auth`；API 层 `web/src/api/saas.ts` 扩展 + `Api.Saas` 类型扩展

**验收**：建库→发文（打标签）→ 发布 → SEO 页/挂件能命中该文章（P1c/P1d 验收项）；未发布文章在 C 端绝不可见。

### 3.3 C 端 SEO 展示页（P1c）

**目标**：租户的知识库以**可被搜索引擎抓取**的网页对外展示，形成自然流量入口与自助服务门户。

**技术选型（关键决策）**：**后端 NestJS 直出 HTML，不建 SSR 前端工程、不引入 ejs/nunjucks**。

- 理由：内容型页面（列表+详情）结构简单；TS 模板函数零新依赖、类型安全、随 `nest build` 产出；避免维护第二个前端工程（成本/边界）。
- 模板实现：`src/modules/saas/public/help-templates.ts`（TS 函数拼 HTML + 内联 CSS；样式内联保证单页自包含、无外链资源）。

**路由**（全部 `@Public` + Throttle 60/min，前缀在 `api/v1` 之外用 `setGlobalPrefix` 的 exclude 机制或独立 `@Controller` 挂根路径——实现时用 exclude 白名单方式，与 `health/ready` 同机制）：

| 路由                                 | 内容                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `GET /help/{tenantCode}`             | 帮助中心首页：租户名 + 已发布文章列表（按 TAG 分组可选）                                |
| `GET /help/{tenantCode}/{slug}`      | 文章详情：Markdown 渲染为 HTML（服务端轻量转换，P1 支持标题/段落/列表/代码块/链接子集） |
| `GET /help/{tenantCode}/sitemap.xml` | 已发布文章 URL 集合                                                                     |
| `GET /robots.txt`（挂根）            | 允许抓取 `/help/*`                                                                      |

**SEO 要素**：

- 每页独立 `<title>`/`<meta name="description">`（seoTitle/seoDescription 回填规则）、`<link rel="canonical">`、Open Graph（og:title/description/type/url）与 Twitter Card。
- 文章页输出 **JSON-LD（schema.org FAQPage/Article）**；FAQ 形式文章（`## 问` 二级标题约定）在搜索结果可出富摘要。
- 语义化 HTML（article/nav/header/h1-h3 层级）、文章页 `viewCount` 自增（运营指标）。
- 租户不存在/无发布文章 → 404 页（同样服务端直出，状态码 404）。

**验收**：curl 抓取能看到完整正文 HTML（禁用 JS 渲染的爬虫可读）；Google Rich Results Test 思路校验 JSON-LD 结构；`sitemap.xml` 可提交。

### 3.4 网页挂件（P1d）

**目标**：租户复制一段 `<script>` 即可把 AI 客服挂到任意网站；回答带知识库内容。

**架构**（iframe 隔离，防宿主页面样式/CSS 冲突）：

```
宿主网站
 └─ <script src="http://平台/widget.js?k=sk-xxx"></script>
     └─ 注入右下角气泡按钮 + <iframe src="http://平台/chat-widget?k=sk-xxx">
          └─ 容器页（后端直出 HTML + vanilla JS）
               ├─ localStorage 持久 visitorId（跨会话续聊）
               ├─ 首屏展示帮助中心推荐文章（来自知识库检索）
               └─ 对话：POST /saas/visitor/chat/stream（X-Api-Key，fetch 流式，帧解析复用 sse-chat.ts 逻辑）
```

| 组成               | 实现                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /widget.js`   | 后端下发零依赖 vanilla JS（TS 常量字符串）：验证 `k` 参数存在 → 创建 iframe（固定右下、响应式收起）→ 气泡开合。可选 `data-position`/`data-color` 定制                                                                                                                                                                                    |
| `GET /chat-widget` | 后端直出容器页：会话 UI（消息列表/输入框/发送）+ SSE 消费（首帧取 conversationId 续聊）+ 错误帧处理（30102 提示 Key 失效）+ 相关文章推荐卡片（链到 `/help/{tenant}/{slug}`）                                                                                                                                                             |
| **知识注入**       | `VisitorChatService` 改造：组 system prompt 前调 `KbSearchService.search(tenantId, kbId?, message)`，Top-N 命中文章以「参考资料」段落注入 `customer-service.v2.md`（新增 v2 模板：要求仅依据资料回答、无资料时如实说并引导人工/留资）；无命中走 v1 行为。**挂件请求体新增可选 `kbId`**（租户在管理端复制挂件代码时生成带 kb 参数的地址） |
| 相关文章接口       | `GET /saas/visitor/articles?k=...&q=...`（X-Api-Key 鉴权，返回 Top-5 标题+slug，供挂件展示推荐；限流）                                                                                                                                                                                                                                   |

**验收**：任意静态页引入 script 即出挂件；提问知识库覆盖的问题 → 回答引用资料内容；提问无关问题 → 按 v2 模板兜底；断网/Key 失效有友好提示；宿主页面样式不受影响。

---

## 四、检索方案（务实取舍）

| 阶段             | 方案                                                                                                                     | 说明                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P1（本阶段）** | **PG 关键词检索**：问题分词 → `ILIKE` 匹配已发布文章 title/content → Top-N 注入 prompt                                   | 零新依赖；不依赖 embedding，MiMo 环境直接可用；对 FAQ/政策类短文效果足够                                                                                                                                     |
| **P2（升级）**   | **pgvector 语义检索**：文章分段落库 + `AiRegistry.embeddings()`（已预埋）向量化 → 余弦相似度 Top-N，与关键词检索加权融合 | 风险：① pgvector 扩展需 DBA 在 PG18 手动 `CREATE EXTENSION vector`（migrations 无先例，须在预发验证）；② 需要一个支持 embedding 的 Provider（MiMo 无此接口，用 OpenAI/通义等配置第二个 Provider 专职向量化） |

过渡策略：`KbSearchService` 抽象为接口（`search(query, opts)`），P1 关键词实现、P2 加向量实现，调用方（挂件问答注入）不感知。

---

## 五、实施排期与验收标准

### P1a 个人中心（约 0.5 天）

- 改动：`auth` 模块（controller/service/dto + 错误码 10005）、`web/src/api/auth.ts`、`web/src/views/system/user-center/index.vue`、`Api.*` 类型
- 验证：`pnpm lint && pnpm typecheck && pnpm test && pnpm build`；`cd web && pnpm lint && pnpm build`；手工：改昵称即时生效、改密强制下线
- 单测：auth.service 改密逻辑（旧密错误/成功路径，mock prisma+redis）

### P1b 知识库 + TAG（约 1.5 天）

- 改动：`schema.prisma`（+4 表）与迁移、`permission-code.ts`（+9 码）、`seed.ts`（PERMISSION_TREE + 菜单）、`src/modules/saas/kb/`（controller×3、service×2、dto）、`web/src/views/saas/kb/`、`web/src/api/saas.ts`、`http/saas.http` 用例
- 验证：三步走 seed 后菜单出现「知识库」；文章 CRUD/发布/标签过滤全链路；`pnpm test:e2e` 不回归；前端两件套全绿
- 单测：kb.service（slug 冲突、发布校验）、KbSearchService（分词命中排序、未发布过滤）

### P1c C 端 SEO 页（约 1 天）

- 改动：`main.ts`（exclude 白名单 +helmet 调整）、`src/modules/saas/public/`（controller/service/help-templates.ts）、`http/help.http` 用例
- 验证：curl 直抓 HTML 含完整正文与 meta/JSON-LD；`/sitemap.xml` 正确；404 场景状态码正确；现有 API 路由不受 exclude 影响
- 单测：模板函数（XSS 转义——用户内容必须 HTML 转义后拼入）、分页/过滤逻辑

### P1d 网页挂件（约 1 天）

- 改动：`visitor-chat.service`（知识注入 + v2 模板）、`customer-service.v2.md`、`src/modules/saas/widget/`（widget.js 下发 + 容器页模板 + 相关文章接口）、`http/saas.http` 补用例、租户管理页「复制挂件代码」按钮
- 验证：静态页实测挂件全流程（新会话/续聊/推荐文章/异常提示）；知识问答引用资料；限流生效；前端两件套 + 后端四件套全绿
- 单测：知识注入分支（有命中/无命中）、widget 参数校验

### 后续路线（本文档范围外，闭环需要）

| 阶段            | 内容                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| **P2 人机协作** | 转人工开关（关键词/低置信触发）、坐席工作台（WS/SSE 实时接管）、访客档案与会话摘要打标、满意度评价、工单 |
| **P3 商业化**   | 套餐（功能开关+配额）、用量计量计费（`ai_call_log.costEstimate` 已有成本口径）、账单、平台运营看板       |
| **P4 增长**     | 微信公众号/小程序渠道适配器、未命中问题挖掘、主动追问澄清、Prompt A/B                                    |

---

## 六、风险、坑位与边界

### 6.1 技术风险

| 风险                                                               | 应对                                                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| helmet 默认 CSP/X-Frame-Options 可能阻止挂件 iframe 嵌入第三方站点 | P1d 实现时对 `/chat-widget` 显式放行 `frame-ancestors *`（仅该路由，不动全局安全基线）；挂件文档注明需 HTTPS 引用 |
| `setGlobalPrefix('api/v1')` exclude 机制                           | 公开页路由与 `health/ready` 同方式加 exclude；实现后回归全部现有路由                                              |
| 用户内容 XSS（SEO 页/挂件渲染 Markdown）                           | 服务端 Markdown 转换前统一 HTML 转义，只允许白名单标签；单测覆盖                                                  |
| pgvector 扩展无先例                                                | 已推迟 P2；届时先在测试库验证 `CREATE EXTENSION`，失败则退 TiDB/独立向量库评估                                    |

### 6.2 已知坑位映射（写作/实施时必查）

- 前端 g-* 灰阶自动适配暗色，**禁止配 `dark:` 变体**；flex 滚动链逐层 `min-h-0`；`art-full-height` 自带纵向 flex
- Windows：后端运行期间 `prisma generate` 报 EPERM → 先停后端
- seed 只 upsert 不删除：移除的权限点要手动清理（两库）
- SSE 消费必须 fetch + ReadableStream（EventSource 只支持 GET）
- 中文请求体用 UTF-8 文件发送（Windows curl GBK 乱码教训）

### 6.3 明确不做的事（防越界）

- 不改 SSE 帧契约（前端/挂件共同依赖）
- 不动现有表结构（tenant/apiKey/conversation/message 只增不改）
- 不引入 SSR 框架（Nuxt 等）与模板引擎依赖（ejs/nunjucks/handlebars）
- P1 不上 pgvector / embedding
- 不做头像上传、多语言、移动端原生 SDK（P4 再议）

---

## 附：P1 完成后的闭环示意图

```
租户在管理后台：建知识库 → 写文章打 TAG → 发布
                ↓ 复制挂件代码 / 分享帮助中心链接
访客网站：      <script src="平台/widget.js?k=sk-xxx"> → 右下角挂件提问
                ↓                        自然流量入口
搜索引擎：   抓取 /help/{tenant}/{slug}（SEO 直出页）
                ↓
AI：检索租户知识库 Top-N → 注入 prompt → 流式回答（审计落库）
                ↓ 答不上
兜底：v2 模板引导转人工/留资（P2 接坐席）
                ↓
平台：会话记录 + 用量审计 + 文章浏览数 → 运营优化 → P3 计费
```
