# AGENTS.md

> 本文件是 AI 编码代理在本仓库工作的行为规范与技术约定。**动手改代码前必读**；与本文件冲突的写法一律以本文件为准。
> 仓库 = **pnpm monorepo**：NestJS 后端（`apps/server`）+ Vue3 管理端（`apps/web`，产品名 NestPerm，模板基于 [art-design-pro](https://github.com/Daymychen/art-design-pro)）+ 前后端共享契约（`packages/contracts`）。前后端是两个独立 app，各自有自己的 Lint 与技术栈，禁止混用工具链；跨端共享的东西**只允许进 `packages/contracts`**。

---

## 一、AI 行为规范（通用）

1. **只改任务范围内的文件**。禁止改动：`apps/server/.env.*`（含真实密钥）、`node_modules/`、`dist/`、Docker/系统/代理等环境配置（除非任务明确要求）。
2. **禁止擅自 `git commit` / `git push`**。改动完成后报告"改了什么 + 如何验证"，由用户决定提交。提交信息统一走 Conventional Commits（根目录 commitlint 管校验，含 cz-git 中文交互，前端可在 `apps/web` 内 `pnpm commit`）。
3. **改完必须验证，全绿才算完成**：

   | 改动范围                                | 必跑检查                                                                              |
   | --------------------------------------- | ------------------------------------------------------------------------------------- |
   | `apps/server/src`、`apps/server/prisma` | `pnpm lint && pnpm typecheck && pnpm test`（根目录，turbo 全仓）                      |
   | 后端接口/权限/数据库                    | 追加 `pnpm build`；有条件再跑 e2e（见 §4.6）                                          |
   | `apps/web/src`                          | `pnpm --filter @nestperm/web lint && pnpm --filter @nestperm/web build`（含 vue-tsc） |
   | `packages/contracts`                    | `pnpm typecheck`（turbo 先 build contracts 再查依赖方）                               |
   | 两侧契约（接口/菜单/权限码）            | 两侧检查都要跑，并实测联调链路（见 §3.5）                                             |

4. **权限相关改动三步走**（缺一步即为不合格改动）：
   ① `packages/contracts/src/permission-code.ts` 加常量 → ② `apps/server/prisma/seed.ts` 的 `PERMISSION_TREE` 登记 → ③ `pnpm prisma:seed`（测试库加 `NODE_ENV=test`）。
5. **服务由用户管理**：dev 后端（:3000）/ 前端（:3006）由用户启停，AI 不要主动 kill 用户进程；`postgres`/`redis` 是基础设施，保持运行即可。
6. **文档随改动同步**：改了启动命令 → 同步 `README.md`；改了接口 → 补 Swagger 注解（`@ApiOperation`）与 `apps/server/http/*.http` 用例。
7. 遇到与本文件不符的旧写法，**先报告再动手**，不要顺手"重构"无关代码。

---

## 二、仓库地图

```
nest后端框架/
├── apps/
│   ├── server/          # 后端 NestJS（:3000）
│   │   ├── src/         # config / infra / shared / modules 四层
│   │   ├── prisma/      # schema.prisma（唯一事实来源）+ migrations + seed.ts
│   │   ├── test/        # e2e（*.e2e-spec.ts）
│   │   ├── http/        # REST Client 接口用例
│   │   └── .env.*       # 环境变量（不入库；.env.example 为模板）
│   └── web/             # 前端管理端（:3006，Vue3 + Element Plus + Tailwind）
│       └── src/         # api / views / components / hooks / store / utils / types
├── packages/
│   └── contracts/       # ★ 前后端共享契约：权限码常量 + 响应信封/分页类型
├── docs/                # 架构设计方案.md + 截图
├── pnpm-workspace.yaml  # workspace 定义（apps/*, packages/*）
├── turbo.json           # 任务管道：build/typecheck/test 依赖 contracts 先 build
├── commitlint.config.mjs# 唯一提交规范（含 cz-git 交互配置）
├── .husky/              # 唯一 git hooks（pre-commit 对根 + 两个 app 分别跑 lint-staged）
└── AGENTS.md            # 本文件
```

|          | 后端（apps/server）                               | 前端（apps/web）                                          |
| -------- | ------------------------------------------------- | --------------------------------------------------------- |
| 技术栈   | NestJS 11 + Prisma 6 + PostgreSQL + Redis         | Vue3 + TS + Vite + Element Plus + Tailwind CSS v4 + Pinia |
| 启动     | `pnpm dev:server`（或根目录 `pnpm dev` 同起两端） | `pnpm dev:web`                                            |
| Lint     | `pnpm --filter @nestperm/server lint`             | `pnpm --filter @nestperm/web lint` / `lint:stylelint`     |
| 构建     | `pnpm --filter @nestperm/server build`            | `pnpm --filter @nestperm/web build`（vue-tsc + vite）     |
| 共享依赖 | `@nestperm/contracts`（workspace:*）              | `@nestperm/contracts`（workspace:*）                      |

---

## 三、功能开发全流程（核心规范：契约先行，自底向上）

> 实现任何新功能（一个模块、一组接口、一个页面）都按下面五步走。**顺序不可颠倒**：先契约后代码、先后端后前端、先 http 用例后页面联调。

### 3.1 第一步：设计契约（先想清楚，再动手）

动手写任何代码前，先回答四个问题并落成文件：

1. **数据模型**：新增/修改哪些 Prisma model？软删除（`deletedAt`）？唯一键？索引？——写进 `apps/server/prisma/schema.prisma`，跑 `pnpm prisma:migrate` 生成迁移。
2. **权限码**：这个功能涉及哪些动作？按 `{模块}:{资源}:{动作}` 三段小写命名，写进 `packages/contracts/src/permission-code.ts`（前后端同源，这是唯一允许的跨端共享位置）。
3. **接口契约**：列出 REST 端点（方法 + 路径 + 入参 + 出参形状）。出参形状统一：单对象直接返回本体，分页用 `{ list, total, page, pageSize }`（契约类型见 contracts 的 `ApiEnvelope` / `PaginatedResult`）。
4. **前端落点**：这个功能的页面 path 是什么（如 `/system/dict`）？按约定对应组件 `apps/web/src/views/system/dict/index.vue`（后端菜单 seed 的 path 驱动前端路由与组件解析，见 §5.2）。

### 3.2 第二步：后端实现（自底向上五层）

严格按依赖方向自底向上写，每层写完就能独立验证：

```
schema/迁移 → DTO → Service → Controller → seed/权限
```

1. **Prisma**：schema 已在第一步定好。跨表写必须 `prisma.$transaction`；查询必须带 `deletedAt: null`；注意 N+1（用 `include/select`）。
2. **DTO**（`modules/{域}/{域}.dto.ts`）：所有入参必须有 DTO——class-validator 装饰 + `@ApiProperty`。全局 ValidationPipe 开了 `whitelist + forbidNonWhitelisted`，DTO 未声明的字段会被拒绝。嵌套对象必须 `@ValidateNested()` + `@IsDefined()`，否则 whitelist 静默剥离并报 "property xxx should not exist"。
3. **Service**（业务唯一所在地）：
   - Controller 零业务，业务规则一律在 Service；
   - 列表接口：`@DataScope({ deptField, ownerField })` + `@DataScopeFilter()` 取 where 片段，在 Service 里与业务条件 `AND` 合并，**不得绕过**；
   - 权限/角色变更后必须发失效事件（`PermCacheEvent.invalidateUser/invalidateRole`），保证"改权限不用重新登录"；
   - 报错一律 `throw new BusinessException(ErrorCode.XXX)`；错误码集中在 `shared/constants/error-code.ts` 登记后再用；
   - BigInt 字段在 API 边界转 Number。
4. **Controller**（接入层）：只做 参数装配 → 调 Service → 返回数据本体（不包壳，全局拦截器统一包 `{ code, message, data, traceId, timestamp }`）。每个端点标注 `@RequirePermissions(PermissionCode.Xxx)`（只引用常量，**禁止权限码字符串字面量**）+ `@ApiOperation`。未标注 = 登录即可；`@Public()` 免登录仅限登录/刷新/健康检查，克制使用。
5. **seed 与验证**：权限码同步进 `apps/server/prisma/seed.ts` 的 `PERMISSION_TREE`，执行 `pnpm prisma:seed`；在 `apps/server/http/` 补 `.http` 用例（REST Client 直接可跑）；核心逻辑写单测（`*.spec.ts` 与源码同目录，Prisma/Redis 一律 mock）。

**后端封装技巧**（复用优先，禁止重复造）：

- 统一响应/异常/traceId/日志都是全局的——**业务代码只返回数据本体**，不要自己 `return { code: 0 }`；
- 分页入参继承 `shared/dto/pagination.dto.ts`；
- 树形结构拼装用 `shared/utils/tree.util.ts`；
- 配置只用 `ConfigService` 读；新增环境变量必须同步 `src/config/env.validation.ts` 的 Joi schema（Fail Fast）；
- 业务模块之间禁止互相 import，通信走 `@nestjs/event-emitter`。

### 3.3 第三步：前端实现（类型 → API → 页面）

1. **类型先行**：请求/响应类型放 `apps/web/src/types/api/` 的 `Api.*` 命名空间（如 `Api.SystemManage.DictItem`），与后端 DTO 一一对应。
2. **API 层**（`apps/web/src/api/*.ts`）：只用 `@/utils/http` 的 `request`（`request.get/post/put/delete<T>`）；**禁止**直接 `import axios` 或裸 `fetch`。函数命名 `fetchXxx`，泛型标注返回类型，URL 带 `/api/v1` 前缀。封装已自动解包 `data`——`request.get<T>` 的返回值就是后端的 `data` 本体，**不要**写 `res.data.data`；非 0 错误码自动抛 `HttpError` 并弹提示，不要重复 catch 提示。
3. **页面**（`apps/web/src/views/{域}/index.vue`）：标准范式 = `art-full-height` + `ElCard art-table-card` + 工具条 + 表格 + 弹窗，参考 `views/system/user/index.vue`。表格逻辑用 `useTable` / `useTableColumns`（`src/hooks/core/`）+ `ArtTable`；搜索区/弹窗表单优先用 `ArtForm` 系列与 `components/core` 现有组件。Element Plus 与 Vue API 走 unplugin 自动导入，**照现有 .vue 的写法**，不要手写 import。业务组件一律进 `src/components/business/`（`components/core/` 是模板自带，保持原样，便于跟进上游升级）。
4. **按钮权限**：`v-auth="PermissionCode.SystemUserCreate"`——权限码**必须 import `@nestperm/contracts` 的常量**，禁止前端自造权限码字符串。
5. **样式**：Tailwind 工具类 + 模板语义类（`art-full-height`、`flex-cb`、`v-ripple` 等）；组件内样式遵循现有 `<style>` 写法并通过 stylelint（`pnpm --filter @nestperm/web lint:stylelint`）；禁止新增全局样式文件/覆盖；不要随意改主题色/布局配置（那走 `src/config` 与主题体系）。
6. **文案**：框架级公共提示走 `$t('...')`（`src/locales/`）；业务页面文案与现有 `views/system/*` 保持一致（直接中文）。

**前端三大坑**（本仓库实测，再遇直接套）：

1. `g-*` 开头的模板语义类自带**自动暗色**，不要再叠 `dark:` 前缀（双重适配出脏色）；
2. flex 纵向滚动链上每一层都要 `min-h-0`，否则内容把容器撑开、内部滚动失效；
3. `art-full-height` 是纵向 flex 容器，其直接子元素想滚动必须自己 `overflow-auto` + `min-h-0`。

### 3.4 第四步：写完自测（不依赖对方）

- 后端：`pnpm dev:server` 起服务，用 `apps/server/http/*.http` 或 Swagger（http://localhost:3000/api/docs）直接打接口，确认响应形状、权限拒绝（403）、数据范围过滤都符合设计；
- 前端：`pnpm dev:web`，后端可以先不跑——确认页面渲染、表单校验、按钮权限显隐（`v-auth` 由登录 profile 的 permissions 驱动）。

### 3.5 第五步：前后端联调

1. **链路**：前端 `:3006` 的 `/api` 代理到后端 `:3000`（vite 代理目标来自 `VITE_API_PROXY_URL`）；部署形态是同源反代，前端 URL 一律用 `/api/v1` 相对路径。
2. **联调顺序**：登录拿 token → `GET /auth/profile` 确认菜单/权限码下发 → 逐个接口过页面。**登录限流 5 次/分钟**，连续调试注意间隔，被 401 了等 60 秒再试；watch 热重载偶发不生效时直接重启 dev。
3. **契约核对清单**（联调出问题先查这四样，90% 是这里）：
   - **响应包**：非 0 code 前端自动弹错——看后端错误码是否合理；
   - **字段名**：后端表是 snake_case（`@@map`），API 出参经 DTO 转 camelCase——前端只写 camelCase；
   - **权限码**：前端 `v-auth` 常量 === 后端 `@RequirePermissions` 常量 === seed 登记（三者同源于 contracts，但 seed 漏登记会表现为"有码但 403"）；
   - **菜单**：新页面需要 seed 里登记 MENU 类型权限点（带 `path`），否则前端路由不存在（§5.2）。
4. **改动回流**：联调中发现契约不合理 → 回到 §3.1 改契约 → 两侧同步改 → **重新跑两侧全量检查**。禁止只在前端打补丁绕过后端。

---

## 四、后端规范（apps/server）

### 4.1 分层红线

- **依赖单向向下**：`Controller → Service → Prisma`；`modules → shared/infra`。禁止反向依赖，禁止业务模块互相 import（通信走 EventEmitter），禁止 Controller 直接访问 Prisma。

### 4.2 统一响应与异常

- 成功响应由全局拦截器包装为 `{ code, message, data, traceId, timestamp }`，业务代码只返回数据本体；SSE/文件下载用 `@SkipWrap()` 跳过。
- 错误一律 `throw new BusinessException(ErrorCode.XXX)`；**禁止** `return { code: -1 }` 式错误。错误码集中在 `src/shared/constants/error-code.ts`。

### 4.3 权限（本框架核心，改动需格外谨慎）

- 受保护接口必须 `@RequirePermissions(PermissionCode.Xxx)`，只引用常量；数据权限 `@DataScope` + `@DataScopeFilter`（§3.2 第 4 点），不得绕过。
- 超管（`isSuper`）全通，但**超管不允许被删除/禁用**。
- 权限缓存走 Redis 精准失效（改权限即时生效，无需重登）。

### 4.4 配置与环境

- 读配置**只用** `ConfigService`，禁止散落 `process.env`；`.env.*` 不入库（`.env.example` 除外），不得把密钥写进代码或日志。

### 4.5 Prisma 约定

- `schema.prisma` 是唯一事实来源；表 `snake_case`（`@@map`），通用字段 `id/createdAt/updatedAt/deletedAt`（**软删除过滤：查询必须带 `deletedAt: null`**）。
- 迁移：开发库 `pnpm prisma:migrate`（自动加载 `apps/server/.env.development`）、测试库 `pnpm prisma:migrate:test`、生产 `pnpm prisma:deploy`。**禁止 `db push` 上生产、禁止手改已生成的迁移文件**。
- Windows 注意：后端服务运行期间 query engine DLL 被占用，`prisma generate` 会报 EPERM——先停后端再生成。

### 4.6 测试要求

- 单测与源码同目录 `*.spec.ts`，依赖全部 mock（Prisma/Redis 一律 mock）；**改核心业务逻辑必须补/改对应单测**。
- e2e 前置：`docker compose up -d` → `pnpm prisma:migrate:test && NODE_ENV=test pnpm prisma:seed` → `pnpm test:e2e`。权限链路改动必须过 e2e。

---

## 五、前端规范（apps/web）

### 5.1 铁律

**一切以模板已有的封装为准，禁止造轮子、禁止绕开封装裸写。** 写前端代码前先找模板里"有没有现成的"。

### 5.2 菜单与路由（后端驱动）

- 菜单与路由由 `GET /auth/profile` 下发的 `menus` 驱动，经 `src/utils/menu-mapper.ts` 映射；
- **新页面必须满足映射约定**：后端菜单 path `/system/user` → 组件 `src/views/system/user/index.vue`；忘 seed 菜单 = 页面 404。

### 5.3 权限（与后端同源）

- 按钮/行内操作用 `v-auth="PermissionCode.Xxx"`（import 自 `@nestperm/contracts`），**禁止前端自造权限码**；
- `v-auth` 只是体验优化，后端 Guard 才是安全边界——不要用前端隐藏替代任何后端校验。

---

## 六、前后端契约（汇总）

- **响应包**：`{ code, message, data, traceId, timestamp }`；`code=0` 成功。前端 http 封装自动解包 `data`、非 0 抛错提示。
- **分页**：入参 `{ page, pageSize }`，出参 `{ list, total, page, pageSize }`。
- **权限码**：`{模块}:{资源}:{动作}` 三段小写，**唯一事实来源 `packages/contracts/src/permission-code.ts`**，后端装饰器/seed 与前端 `v-auth` 全部引用它（前后端同一套码）。
- **菜单**：`profile.menus` 为 `DIR/MENU` 树，`path` 驱动前端组件解析，`icon` 用 iconify 格式（如 `ri:xxx`）。
- **常用错误码**：`40101` 未登录、`40102` 刷新令牌失效、`40301` 无权限、`10001` 登录失败（权威定义在 `apps/server/src/shared/constants/error-code.ts`）。

---

## 七、常用命令速查

```bash
# 根目录（workspace 编排）
pnpm dev                 # turbo 同时起后端 :3000 + 前端 :3006
pnpm dev:server          # 只起后端（nest watch 热重载）
pnpm dev:web             # 只起前端
pnpm lint && pnpm typecheck && pnpm test     # 全仓三件套（turbo，改完必跑）
pnpm build               # contracts → server → web 依序构建
pnpm check:circular      # 后端循环依赖检查

# 单 app 专项（根目录执行，--filter 定位）
pnpm --filter @nestperm/server lint / test / test:e2e / start:debug
pnpm --filter @nestperm/web lint / build / typecheck / commit

# Prisma（根目录执行）
pnpm prisma:generate     # Windows：后端服务运行中会 EPERM，先停服务
pnpm prisma:migrate      # 开发库迁移
pnpm prisma:seed         # 种子数据（测试库：NODE_ENV=test pnpm prisma:seed）
pnpm db:init             # 迁移 + seed 一步到位

# contracts（通常由 turbo 自动带出，手动时）
pnpm --filter @nestperm/contracts build
```

- Swagger：http://localhost:3000/api/docs ；健康检查：`/health`、`/ready`
- 内置账号（仅本地验证）：`admin / Admin@123`（超管）、`demo / Demo@123`（普通用户，系统管理只读）
- 提交：根目录 `git commit` 走 hooks 校验（lint-staged 分根/server/web 三份配置）；前端中文交互式提交在 `apps/web` 下 `pnpm commit`（cz-git）
