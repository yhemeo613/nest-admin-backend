# AGENTS.md

> 本文件是 AI 编码代理在本仓库工作的行为规范与技术约定。**动手改代码前必读**；与本文件冲突的写法一律以本文件为准。
> 仓库 = NestJS 后端（根目录）+ Vue3 前端（`web/`，基于 [art-design-pro](https://github.com/Daymychen/art-design-pro) 模板）。前后端是**两个独立工程**，各自有自己的依赖、Lint、构建与提交规范，禁止混用工具链。

---

## 一、AI 行为规范（通用）

1. **只改任务范围内的文件**。禁止改动：`.env.development` / `.env.test`（含真实密钥）、`node_modules/`、`dist/`、`web/dist/`、Docker/系统/代理等环境配置（除非任务明确要求）。
2. **禁止擅自 `git commit` / `git push`**。改动完成后报告"改了什么 + 如何验证"，由用户决定提交。提交信息：后端走 Conventional Commits（commitlint），前端走 cz-git。
3. **改完必须验证，全绿才算完成**：

   | 改动范围                     | 必跑检查                                          |
   | ---------------------------- | ------------------------------------------------- |
   | 后端 `src/`、`prisma/`       | `pnpm lint && pnpm typecheck && pnpm test`        |
   | 后端接口/权限/数据库         | 追加 `pnpm build`；有条件再跑 e2e（见 §3 测试）   |
   | 前端 `web/src/`              | `cd web && pnpm lint && pnpm build`（含 vue-tsc） |
   | 两侧契约（接口/菜单/权限码） | 两侧检查都要跑，并实测联调链路                    |

4. **权限相关改动三步走**（缺一步即为不合格改动）：
   ① `src/shared/constants/permission-code.ts` 加常量 → ② `prisma/seed.ts` 的 `PERMISSION_TREE` 登记 → ③ 执行 `pnpm prisma:seed`（测试库加 `NODE_ENV=test`）。
5. **服务由用户管理**：dev 后端（:3000）/ 前端（:3006）由用户启停，AI 不要主动 kill 用户进程；`postgres`/`redis` 容器是基础设施，保持运行即可。
6. **文档随改动同步**：改了启动命令 → 同步 `README.md`；改了接口 → 补 Swagger 注解（`@ApiOperation`）与 `http/*.http` 用例。
7. 遇到与本文件不符的旧写法，**先报告再动手**，不要顺手"重构"无关代码。

---

## 二、仓库地图

```
nest后端框架/
├── src/                  # 后端 NestJS 源码（config / infra / shared / modules 四层）
├── prisma/               # schema.prisma（唯一事实来源）+ migrations + seed.ts
├── test/                 # e2e（*.e2e-spec.ts）
├── http/                 # REST Client 接口用例
├── docs/架构设计方案.md   # 设计文档（权限体系详见此文档）
├── web/                  # ★ 前端独立工程（art-design-pro 模板）
└── AGENTS.md             # 本文件
```

|          | 后端                                      | 前端                                                      |
| -------- | ----------------------------------------- | --------------------------------------------------------- |
| 技术栈   | NestJS 11 + Prisma 6 + PostgreSQL + Redis | Vue3 + TS + Vite + Element Plus + Tailwind CSS v4 + Pinia |
| 目录     | `src/{config,infra,shared,modules}`       | `web/src/{api,views,components,hooks,store,utils,types}`  |
| 启动     | `pnpm dev`（:3000）                       | `cd web && pnpm dev`（:3006）                             |
| Lint     | `pnpm lint`                               | `cd web && pnpm lint` / `pnpm lint:stylelint`             |
| 提交钩子 | husky + lint-staged + commitlint          | husky + lint-staged + cz-git                              |

---

## 三、后端规范（NestJS）

### 3.1 分层红线

- **依赖单向向下**：`Controller → Service → Prisma`；`modules → shared/infra`。禁止反向依赖，禁止业务模块互相 import（通信走 EventEmitter），禁止 Controller 直接访问 Prisma。
- **Controller 零业务**：只做参数装配 → 调 Service → 返回；业务规则一律在 Service。
- 所有入参必须有 DTO（class-validator 装饰 + `@ApiProperty`），全局 ValidationPipe 已开 `whitelist + forbidNonWhitelisted`，DTO 未声明的字段会被拒绝。

### 3.2 统一响应与异常

- 成功响应由全局拦截器包装为 `{ code: 0, message, data, traceId, timestamp }`，业务代码**只返回数据本体**，不要自己包壳。
- 报错一律 `throw new BusinessException(ErrorCode.XXX)`；**禁止** `return { code: -1 }` 式错误。错误码集中在 `src/shared/constants/error-code.ts`。
- SSE/文件下载接口用 `@SkipWrap()` 跳过包装。

### 3.3 权限（本框架核心，改动需格外谨慎）

- 受保护接口必须标注 `@RequirePermissions(PermissionCode.Xxx)`，**只允许引用常量，禁止权限码字符串字面量**。
- 未标注 = 登录即可；`@Public()` = 免登录，仅限登录/刷新/健康检查等，**克制使用**。
- 数据权限：列表接口 `@DataScope({ deptField, ownerField })` + `@DataScopeFilter()` 取 where 片段，在 Service 里与业务条件 `AND` 合并；不得绕过。
- 权限/角色/用户关系变更后必须发失效事件（`PermCacheEvent.invalidateUser/invalidateRole`），保证"改权限不用重新登录"。
- 超管（`isSuper`）全通，但**超管不允许被删除/禁用**。

### 3.4 配置与环境

- 读配置**只用** `ConfigService`，禁止散落 `process.env`；新增环境变量必须同步 `src/config/env.validation.ts` 的 Joi schema（Fail Fast）。
- `.env.*` 不入库（`.env.example` 除外），不得把密钥写进代码或日志。

### 3.5 Prisma 约定

- `schema.prisma` 是唯一事实来源；表 `snake_case`（`@@map`），通用字段 `id/createdAt/updatedAt/deletedAt`（**软删除过滤：查询必须带 `deletedAt: null`**）。
- 迁移：开发库 `pnpm prisma:migrate`（自动加载 `.env.development`）、测试库 `pnpm prisma:migrate:test`、生产 `pnpm prisma:deploy`（由部署方注入环境变量）。**禁止 `db push` 上生产、禁止手改已生成的迁移文件**。
- 跨表写入用 `prisma.$transaction`；注意 N+1（用 `include/select`）。
- Windows 注意：后端服务运行期间 query engine DLL 被占用，`prisma generate` 会报 EPERM——先停后端再生成。

### 3.6 测试要求

- 单测与源码同目录 `*.spec.ts`，依赖全部 mock（Prisma/Redis 一律 mock）；**改核心业务逻辑必须补/改对应单测**。
- e2e 前置：`docker compose up -d` → `pnpm prisma:migrate:test && NODE_ENV=test pnpm prisma:seed` → `pnpm test:e2e`。权限链路改动必须过 e2e。

---

## 四、前端规范（web/，以 art-design-pro 为准）

> **铁律：一切以模板已有的封装为准，禁止造轮子、禁止绕开封装裸写。** 写前端代码前先找模板里"有没有现成的"。

### 4.1 请求与 API 层

- **只用** `@/utils/http` 的 `request`（`request.get/post/put/delete<T>`）；**禁止**业务代码直接 `import axios` 或裸 `fetch`。
- 封装已提供：自动携带 Token、401 自动登出（防抖）、失败重试、非 0 错误码统一抛 `HttpError` 并弹提示、**自动解包 `data`**——`request.get<T>` 返回值就是后端的 `data` 本体，不要再写 `res.data.data`。
- API 函数写在 `src/api/*.ts`，命名 `fetchXxx`，泛型标注返回类型，URL 带 `/api/v1` 前缀；请求/响应类型放 `src/types/api/` 的 `Api.*` 命名空间（如 `Api.Auth.LoginParams`）。

### 4.2 权限（与后端同源）

- 按钮/行内操作用指令 **`v-auth="'system:user:create'"`**，权限码必须与后端 `PermissionCode` 常量一致，**禁止前端自造权限码**。
- 菜单与路由由 `GET /auth/profile` 下发的 `menus` 驱动，经 `src/utils/menu-mapper.ts` 映射；**新页面必须满足映射约定**：后端菜单 path `/system/user` → 组件 `src/views/system/user/index.vue`。
- 原则：`v-auth` 只是体验优化，后端 Guard 才是安全边界——不要用前端隐藏替代任何后端校验。

### 4.3 页面与组件

- **表格页标准写法**：`useTable` / `useTableColumns`（`src/hooks/core/`）+ `ElTable` 或模板 `ArtTable`；搜索区、弹窗、表单优先用模板的 `ArtForm` 系列与 `components/core` 现有组件（`ArtTable`、`ArtSvgIcon`、`ArtPageContent`、`ArtException`…）。
- 组件归属：`src/components/core/` 是模板自带（保持原样，便于跟进上游升级），业务组件一律进 `src/components/business/`。
- Element Plus 与 Vue API 走 unplugin 自动导入，**照现有 `.vue` 文件的写法**，不要凭习惯手写 import。
- 新增页面放 `src/views/{业务域}/`，与后端菜单 path 对齐；参考 `src/views/system/user/index.vue` 的成熟范式（`art-full-height` + `ElCard art-table-card` + 工具条 + 表格 + 弹窗）。

### 4.4 样式

- **Tailwind CSS 工具类 + 模板语义类**（`art-full-height`、`art-table-card`、`flex-cb`、`v-ripple` 等），参考现有页面的 class 组合。
- 禁止新增全局样式文件/全局覆盖；组件内样式按模板现有 `<style>` 写法；样式必须过 stylelint（`pnpm lint:stylelint`）。
- 不要随意改主题色/布局配置，那走 `src/config` 与主题体系。

### 4.5 国际化与文案

- 框架级、公共提示文案走 `$t('...')`（`src/locales/`）；业务页面文案与现有 `views/system/*` 保持一致（直接中文）。新增公共文案才进 locales。

### 4.6 前端命令

```bash
cd web
pnpm dev            # 开发（:3006，/api 代理到 :3000）
pnpm lint           # ESLint；pnpm lint:stylelint 单查样式
pnpm build          # vue-tsc 类型检查 + 构建（改完必跑）
```

---

## 五、前后端契约

- **响应包**：`{ code, message, data, traceId, timestamp }`；`code=0` 成功，其余为业务错误。前端 http 封装自动解包 `data`、非 0 抛错提示。
- **常用错误码**：`40101` 未登录、`40102` 刷新令牌失效、`40301` 无权限、`10001` 登录失败（后端权威定义在 `error-code.ts`）。
- **权限码**：`{模块}:{资源}:{动作}` 三段小写，前后端**同一套码**（后端 `permission-code.ts` ↔ 前端 `v-auth`）。
- **菜单**：`profile.menus` 为 `DIR/MENU` 树，`path` 驱动前端组件解析，`icon` 用 iconify 格式（如 `ri:xxx`）。

---

## 六、常用命令速查

```bash
# 后端（仓库根目录）
pnpm dev                 # 启动后端 :3000（热重载）
pnpm lint && pnpm typecheck && pnpm test     # 三件套（改完必跑）
pnpm build               # 构建；pnpm check:circular 查循环依赖
pnpm prisma:migrate      # 开发库迁移（自动加载 .env.development）
pnpm prisma:seed         # 种子数据（测试库：NODE_ENV=test pnpm prisma:seed）
pnpm test:e2e            # e2e（前置见 §3.7）

# 前端（web/）
pnpm dev / pnpm lint / pnpm build
```

- Swagger：http://localhost:3000/api/docs ；健康检查：`/health`、`/ready`
- 内置账号（仅本地验证）：`admin / Admin@123`（超管）、`demo / Demo@123`（普通用户，系统管理只读）
