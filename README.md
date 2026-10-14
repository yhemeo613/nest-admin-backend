# NestJS 权限中枢 + 管理前端

![License: MIT](https://img.shields.io/badge/license-MIT-green)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D)
![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A59-DD0031)

企业级**细粒度权限中枢**：后端 RBAC 权限码模型（接口/按钮/数据行三级校验）+ 前端[管理端](./web)（基于 [art-design-pro](https://github.com/Daymychen/art-design-pro)，Vue3 + TS + Vite + Element Plus + Tailwind），已完整对接权限体系。

## 特性

- 🔐 **三级权限体系**：RBAC 权限码模型，粒度到接口（`@RequirePermissions`）、按钮（前端 `v-auth`）、数据行（`@DataScope` 部门树/本人/自定义范围）；前后端共用同一套权限码，角色改权限**无需重新登录**即时生效（Redis 精准失效）
- 👥 **组织与账号**：用户/角色/部门/权限点四管理页；角色支持菜单权限、按钮权限与数据范围（全部/本部门及子级/本部门/本人）分配；超管全通且不可删除/禁用
- 🔑 **安全默认**：JWT 双 Token（旋转 + 单点踢人）、argon2 密码哈希、登录限流、helmet、DTO 白名单校验、配置 Joi 启动校验（Fail Fast）
- 🧱 **统一横切**：统一响应包 `{code, message, data, traceId, timestamp}`、全局异常兜底（Prisma 错误归一化）、AsyncLocalStorage 全链路 traceId、结构化日志（pino）
- 👤 **个人中心**：自助修改资料/密码（改密成功强制重新登录）；忘记密码页引导联系平台管理员重置
- 🧰 **工程化**：ESLint 9 + Prettier + Stylelint、husky + lint-staged + commitlint、madge 循环依赖检查、Swagger（生产自动关闭）、Docker 多阶段构建、VS Code 四配置断点调试

## 页面预览

| 登录                                       | 个人中心（自助资料 / 改密）                     |
| ------------------------------------------ | ----------------------------------------------- |
| ![登录](./docs/screenshots/auth-login.png) | ![个人中心](./docs/screenshots/user-center.png) |

## 架构

```
┌────────────────────────────────────────────────┐
│ Controller（接入层：路由/参数解析，零业务）       │
├────────────────────────────────────────────────┤
│ Service（应用层：用例编排、事务边界）             │
├────────────────────────────────────────────────┤
│ Prisma schema（领域层：唯一事实来源）            │
├────────────────────────────────────────────────┤
│ infra（基础设施：prisma/redis/logger，可替换）    │
└────────────────────────────────────────────────┘
        Vue3 管理端（web/ :3006）── /api/v1 ──→ NestJS（:3000）
```

依赖单向向下：`Controller → Service → Prisma`；业务模块之间通过事件通信。

## 技术栈

| 领域      | 选型                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| 后端      | NestJS 11 · TypeScript 5（strict）· Prisma 6 · PostgreSQL · Redis 7                     |
| 认证鉴权  | @nestjs/jwt 双 Token · argon2 · 自研权限码 RBAC · @nestjs/throttler                     |
| 日志/文档 | nestjs-pino（结构化 JSON + traceId）· @nestjs/swagger                                   |
| 前端      | Vue 3 · Vite · Element Plus · Tailwind CSS 4 · Pinia · axios 统一封装（`@/utils/http`） |
| 工程化    | pnpm · ESLint 9 flat · Prettier · Stylelint · husky + commitlint · Jest · Docker        |

## 快速开始（前端 + 后端）

```bash
# 0. 克隆后先复制环境文件（.env.* 不入库，变量模板见 .env.example）
cp .env.example .env.development

# 1. 安装依赖
pnpm install

# 2. 启动基础设施（PostgreSQL + Redis）
docker compose up -d

# 3. 初始化数据库（迁移 + 种子数据）
pnpm prisma:migrate      # 首次执行（自动加载 .env.development）
pnpm prisma:seed         # 初始化权限树 + admin/demo 账号

# 4. 启动后端（或 VS Code 按 F5 断点调试）
pnpm dev

# 5. 启动前端（另一个终端）
cd web && pnpm install && pnpm dev   # http://localhost:3006
```

- 接口文档：<http://localhost:3000/api/docs>
- 健康检查：<http://localhost:3000/health>、<http://localhost:3000/ready>
- 前端页面：<http://localhost:3006>（登录后自动按权限生成菜单）
- 内置账号：`admin / Admin@123`（超管，全部菜单）、`demo / Demo@123`（普通用户，系统管理只读）

> 没有 Docker？本地装好 PostgreSQL 16 与 Redis 7，修改 `.env.development` 中的连接串即可。

## 常用命令

| 命令                                               | 说明                                                 |
| -------------------------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                                         | 后端开发模式（热重载，:3000）                        |
| `pnpm start:debug`                                 | 调试模式（9229 端口，配合 VS Code F5）               |
| `pnpm build`                                       | 构建到 dist（自动重写路径别名）                      |
| `pnpm lint` / `pnpm lint:fix`                      | ESLint 检查 / 修复                                   |
| `pnpm typecheck`                                   | TS 类型检查                                          |
| `pnpm test`                                        | 单元测试（无需 DB）                                  |
| `pnpm test:e2e`                                    | e2e 测试（需先起库并 seed，见「测试」）              |
| `pnpm prisma:migrate` / `pnpm prisma:migrate:test` | 开发库 / 测试库迁移                                  |
| `pnpm prisma:seed`                                 | 种子数据（测试库：`NODE_ENV=test pnpm prisma:seed`） |
| `pnpm check:circular`                              | 循环依赖检查                                         |
| `cd web && pnpm dev / lint / build`                | 前端：开发 / 检查 / 构建（含 vue-tsc）               |

## 目录结构

```
src/
├── config/        # 配置中心（Joi 启动校验）
├── infra/         # 基础设施：prisma / redis / logger
├── shared/        # 横切能力：守卫 / 拦截器 / 过滤器 / 装饰器 / 常量 / 缓存服务
└── modules/       # 业务模块：auth / system(用户·角色·权限·部门) / health
web/               # Vue3 管理端（art-design-pro：api / views / components / hooks）
prisma/            # schema + 迁移 + seed（权限树初始化）
docs/              # 架构设计方案
http/              # REST Client 接口用例（登录/系统管理）
test/              # e2e 测试
AGENTS.md          # AI 编码代理行为规范与技术约定
.vscode/           # 调试四配置 + 编辑器规范（入库统一）
```

## 权限使用指南

### 后端：给接口加权限

```typescript
@Post()
@RequirePermissions(PermissionCode.SystemUserCreate)   // 引用常量，禁止写字符串
create(@Body() dto: CreateUserDto) { ... }
```

- 未标注接口：登录即可访问；`@Public()`：免登录；超管：全通。
- 列表接口加数据权限：`@DataScope()` + `@DataScopeFilter()` 取 where 片段合并查询。
- 新增权限码：先在 `src/shared/constants/permission-code.ts` 加常量，再在 `prisma/seed.ts` 的 `PERMISSION_TREE` 登记并执行 `pnpm prisma:seed`。

### 前端：按钮与路由控制

`GET /api/v1/auth/profile` 返回 `permissions: string[]` 与 `menus` 树：

```vue
<el-button v-auth="'system:user:create'">新增用户</el-button>
```

- 按钮显隐用 `v-auth` 指令（权限码与后端 `PermissionCode` 同源，禁止前端自造）；
- 菜单树经 `web/src/utils/menu-mapper.ts` 映射为前端路由：后端菜单 path `/system/user` → 组件 `web/src/views/system/user/index.vue`，新增页面须遵循该约定；
- 表格页优先使用模板封装：`useTable` / `useTableColumns` / `ArtTable` / `ArtForm`，请求只走 `@/utils/http`（自动带 Token、401 自动登出、自动解包 `data`）。

权限变更即时生效：管理端调整角色权限后，用户**无需重新登录**（Redis 缓存精准失效）。

## 调试

VS Code 按 F5 选择：

| 配置                 | 用途                           |
| -------------------- | ------------------------------ |
| Debug: Nest App      | 断点调试应用（改代码自动重启） |
| Debug: Jest 当前文件 | 断点调试光标所在测试           |
| Debug: Jest e2e      | 断点调试 e2e                   |
| Attach: 9229         | 附加到进程 / Docker 容器       |

## 测试

- 单元测试与源码同目录（`*.spec.ts`），依赖全部 mock，零外网依赖；
- e2e 需基础设施：`docker compose up -d` 后 `pnpm prisma:migrate:test && NODE_ENV=test pnpm prisma:seed`，再 `pnpm test:e2e`；
- 质量门禁：`pnpm lint && pnpm typecheck && pnpm test` 全绿才可提交（husky 提交时自动执行 lint-staged）。

## 设计文档

完整设计（权限模型、数据表、编码规范、实施路线图）详见 [docs/架构设计方案.md](./docs/架构设计方案.md)；AI 编码代理工作约定见 [AGENTS.md](./AGENTS.md)。

## License

[MIT](./LICENSE) © yhemeo613 —— 可自由用于个人及商业项目（复制、修改、分发、闭源集成均允许，保留版权声明即可）。
