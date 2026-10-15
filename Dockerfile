# syntax=docker/dockerfile:1
# monorepo 布局：只构建 @nestperm/server + 其工作区依赖 @nestperm/contracts（apps/web 不进镜像）

# ---------- deps：按 lockfile 安装 server 相关依赖（含 devDeps，用于构建） ----------
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
# argon2 等原生模块兜底编译环境（有预编译二进制时不会用到）
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN pnpm install --frozen-lockfile --filter @nestperm/server...

# ---------- build：构建 contracts → 生成 Prisma Client → 编译 server ----------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY packages/contracts ./packages/contracts
COPY apps/server ./apps/server
RUN pnpm --filter @nestperm/contracts build \
  && pnpm --filter @nestperm/server prisma:generate \
  && pnpm --filter @nestperm/server build \
  && pnpm prune --prod

# ---------- runner：生产运行（非 root） ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
# hoisted 布局：生产依赖全在根 node_modules；@nestperm/contracts 为指向 packages/contracts 的符号链接，两者需一并拷贝
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=nestjs:nodejs /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=nestjs:nodejs /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=nestjs:nodejs /app/apps/server/prisma ./apps/server/prisma
COPY --from=build --chown=nestjs:nodejs /app/apps/server/package.json ./apps/server/package.json
WORKDIR /app/apps/server
USER nestjs
# 3000 应用端口；9229 调试端口（配合 node --inspect，仅调试场景映射）
EXPOSE 3000 9229
CMD ["node", "dist/main.js"]
