# syntax=docker/dockerfile:1

# ---------- deps：安装全部依赖（含 devDeps，用于构建） ----------
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
# argon2 等原生模块兜底编译环境（有预编译二进制时不会用到）
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---------- build：生成 Prisma Client 并编译 ----------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma:generate && pnpm build && pnpm prune --prod

# ---------- runner：生产运行（非 root） ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/package.json ./
USER nestjs
# 3000 应用端口；9229 调试端口（配合 node --inspect，仅调试场景映射）
EXPOSE 3000 9229
CMD ["node", "dist/main.js"]
