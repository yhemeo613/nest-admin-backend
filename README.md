# NestJS 权限中枢 + 管理前端（Monorepo）

![License: MIT](https://img.shields.io/badge/license-MIT-green)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D)
![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A510-DD0031)

企业级**细粒度权限中枢**（pnpm monorepo）：后端 RBAC 权限码模型（接口/按钮/数据行三级校验）+ 前端[管理端](./apps/web)（基于 [art-design-pro](https://github.com/Daymychen/art-design-pro)，Vue3 + TS + Vite + Element Plus + Tailwind），已完整对接权限体系；前后端共享契约（权限码/响应形状）收敛在 [packages/contracts](./packages/contracts)。

## 特性

- 🔐 **三级权限体系**：RBAC 权限码模型，粒度到接口（`@RequirePermissions`）、按钮（前端 `v-auth`）、数据行（`@DataScope` 部门树/本人/自定义范围）；前后端**同源引用** `@nestperm/contracts` 的权限码常量，角色改权限**无需重新登录**即时生效（Redis 精准失效）
- 👥 **组织与账号**：用户/角色/部门/权限点四管理页；角色支持菜单权限、按钮权限与数据范围（全部/本部门及子级/本部门/本人）分配；超管全通且不可删除/禁用
- 🔑 **安全默认**：JWT 双 Token（旋转 + 单点踢人）、argon2 密码哈希、登录限流、helmet、DTO 白名单校验、配置 Joi 启动校验（Fail Fast）
- 🧱 **统一横切**：统一响应包 `{code, message, data, traceId, timestamp}`、全局异常兜底（Prisma 错误归一化）、AsyncLocalStorage 全链路 traceId、结构化日志（pino）
- 👤 **个人中心**：自助修改资料/密码（改密成功强制重新登录）；忘记密码页引导联系平台管理员重置
- 🧰 **工程化**：pnpm workspaces + Turborepo（增量缓存）、ESLint 9 + Prettier + Stylelint、husky + lint-staged + commitlint、madge 循环依赖检查、Swagger（生产自动关闭）、Docker 多阶段构建、VS Code 四配置断点调试

## 页面预览

| 登录                                       | 个人中心（自助资料 / 改密）                     |
| ------------------------------------------ | ----------------------------------------------- |
| ![登录](./docs/screenshots/auth-login.png) | ![个人中心](./docs/screenshots/user-center.png) |

## 仓库结构

```
├── apps/
│   ├── server/          # NestJS 后端（:3000）
│   │   ├── src/         # config / infra / shared / modules 四层
│   │   ├── prisma/      # schema + 迁移 + seed（权限树初始化）
│   │   ├── http/        # REST Client 接口用例
│   │   └── test/        # e2e 测试
│   └── web/             # Vue3 管理端（:3006，art-design-pro）
├── packages/
│   └── contracts/       # 前后端共享契约：权限码常量 + 响应信封/分页类型
├── docs/                # 架构设计方案
├── pnpm-workspace.yaml  # workspace 定义
├── turbo.json           # 任务管道（build/typecheck/test 依赖 contracts 先 build）
└── AGENTS.md            # AI 编码代理行为规范与技术约定

apps/server 内部（四层单向依赖）：

```

src/
├── config/ # 配置中心（Joi 启动校验）
├── infra/ # 基础设施：prisma / redis / logger
├── shared/ # 横切能力：守卫 / 拦截器 / 过滤器 / 装饰器 / 常量 / 缓存服务
└── modules/ # 业务模块：auth / system(用户·角色·权限·部门) / health

```

```

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
   packages/contracts（权限码/响应形状，前后端同源）
        Vue3 管理端（apps/web :3006）── /api/v1 ──→ NestJS（apps/server :3000）
```

依赖单向向下：`Controller → Service → Prisma`；业务模块之间通过事件通信。

## 技术栈

| 领域      | 选型                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------- |
| 后端      | NestJS 11 · TypeScript 5（strict）· Prisma 6 · PostgreSQL · Redis 7                                     |
| 认证鉴权  | @nestjs/jwt 双 Token · argon2 · 自研权限码 RBAC · @nestjs/throttler                                     |
| 日志/文档 | nestjs-pino（结构化 JSON + traceId）· @nestjs/swagger                                                   |
| 前端      | Vue 3 · Vite · Element Plus · Tailwind CSS 4 · Pinia · axios 统一封装（`@/utils/http`）                 |
| 工程化    | pnpm workspaces · Turborepo · ESLint 9 flat · Prettier · Stylelint · husky + commitlint · Jest · Docker |

## 快速开始

```bash
# 0. 克隆后先复制环境文件（.env.* 不入库，变量模板见 apps/server/.env.example）
cp apps/server/.env.example apps/server/.env.development

# 1. 安装依赖（根目录一次装齐全部 workspace）
pnpm install

# 2. 启动基础设施（PostgreSQL + Redis；无 Docker 则用本地实例并改连接串）
docker compose up -d

# 3. 初始化数据库（迁移 + 种子数据）
pnpm prisma:migrate      # 首次执行（自动加载 apps/server/.env.development）
pnpm prisma:seed         # 初始化权限树 + admin/demo 账号

# 4. 启动开发（根目录一条命令同时起两端；或分别用 dev:server / dev:web）
pnpm dev                 # 后端 :3000 + 前端 :3006（VS Code F5 亦可断点调试后端）
```

- 接口文档：<http://localhost:3000/api/docs>
- 健康检查：<http://localhost:3000/health>、<http://localhost:3000/ready>
- 前端页面：<http://localhost:3006>（登录后自动按权限生成菜单）
- 内置账号：`admin / Admin@123`（超管，全部菜单）、`demo / Demo@123`（普通用户，系统管理只读）

> 没有 Docker？本地装好 PostgreSQL 16 与 Redis 7，修改 `apps/server/.env.development` 中的连接串即可。
>
> **依赖版本约定**：前端核心依赖（vue / element-plus / pinia / vue-router / axios）在根 `package.json` 的 `pnpm.overrides` 中钉定为已验证版本——**升级依赖前先跑全仓 `pnpm lint && pnpm typecheck && pnpm build`，不要直接改 semver**。首次安装若卡在 `@prisma/engines` 下载（Prisma 引擎直连境外 CDN），挂代理后重试：`HTTPS_PROXY=http://127.0.0.1:7890 pnpm install`。

## 常用命令（根目录执行）

| 命令                                               | 说明                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| `pnpm dev`                                         | 同时起后端（:3000）与前端（:3006）                     |
| `pnpm dev:server` / `pnpm dev:web`                 | 单起后端 / 前端                                        |
| `pnpm build`                                       | 依序构建 contracts → server → web                      |
| `pnpm lint` / `pnpm typecheck` / `pnpm test`       | 全仓 ESLint / TS 类型检查 / 单元测试（Turborepo 缓存） |
| `pnpm test:e2e`                                    | e2e（需先起库并 seed，见「测试」）                     |
| `pnpm prisma:migrate` / `pnpm prisma:migrate:test` | 开发库 / 测试库迁移                                    |
| `pnpm prisma:seed`                                 | 种子数据（测试库：`NODE_ENV=test pnpm prisma:seed`）   |
| `pnpm check:circular`                              | 后端循环依赖检查                                       |
| `pnpm --filter @nestperm/web lint / build`         | 前端：检查 / 构建（含 vue-tsc）                        |

## 权限使用指南

### 后端：给接口加权限

```typescript
@Post()
@RequirePermissions(PermissionCode.SystemUserCreate)   // 引用常量，禁止写字符串
create(@Body() dto: CreateUserDto) { ... }
```

- 未标注接口：登录即可访问；`@Public()`：免登录；超管：全通。
- 列表接口加数据权限：`@DataScope()` + `@DataScopeFilter()` 取 where 片段合并查询。
- 新增权限码三步走：`packages/contracts/src/permission-code.ts` 加常量 → `apps/server/prisma/seed.ts` 的 `PERMISSION_TREE` 登记 → `pnpm prisma:seed`。

### 前端：按钮与路由控制

`GET /api/v1/auth/profile` 返回 `permissions: string[]` 与 `menus` 树：

```vue
<script setup lang="ts">
import { PermissionCode } from '@nestperm/contracts';
</script>

<template>
  <el-button v-auth="PermissionCode.SystemUserCreate">新增用户</el-button>
</template>
```

- 按钮显隐用 `v-auth` 指令，权限码**必须 import 自 `@nestperm/contracts`**（与后端同源，禁止前端自造字符串）；
- 菜单树经 `apps/web/src/utils/menu-mapper.ts` 映射为前端路由：后端菜单 path `/system/user` → 组件 `apps/web/src/views/system/user/index.vue`，新增页面须遵循该约定；
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

- 单元测试与源码同目录（`apps/server/src/**/*.spec.ts`），依赖全部 mock，零外网依赖；
- e2e 需基础设施：`docker compose up -d` 后 `pnpm prisma:migrate:test && NODE_ENV=test pnpm prisma:seed`，再 `pnpm test:e2e`；
- 质量门禁：`pnpm lint && pnpm typecheck && pnpm test` 全绿才可提交（husky 提交时对根/server/web 三份配置分别执行 lint-staged）。

## 设计文档

完整设计（权限模型、数据表、编码规范、实施路线图）详见 [docs/架构设计方案.md](./docs/架构设计方案.md)；AI 编码代理工作约定（含功能开发全流程）见 [AGENTS.md](./AGENTS.md)。

## License

[MIT](./LICENSE) © yhemeo613 —— 可自由用于个人及商业项目（复制、修改、分发、闭源集成均允许，保留版权声明即可）。
