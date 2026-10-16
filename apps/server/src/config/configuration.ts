export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.APP_PORT ?? '3000', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? '',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL_SECONDS ?? '7200', 10),
    refreshTtlSeconds: parseInt(process.env.JWT_REFRESH_TTL_SECONDS ?? '604800', 10),
  },
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
  log: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  review: {
    // 密钥缺省派生自 JWT_ACCESS_SECRET（sha256 hex 前 32 字节），生产建议显式 REVIEW_CRYPTO_KEY
    cryptoKey: process.env.REVIEW_CRYPTO_KEY,
    ocrBinPath: process.env.OCR_BIN_PATH ?? 'ocr',
    workspaceDir: process.env.REVIEW_WORKSPACE_DIR ?? 'workspaces/review',
    taskTimeoutMs: parseInt(process.env.REVIEW_TASK_TIMEOUT_MS ?? '1800000', 10),
    workerConcurrency: parseInt(process.env.REVIEW_WORKER_CONCURRENCY ?? '1', 10),
    ocrBinArgsPrefix: (() => {
      try {
        const raw = process.env.OCR_BIN_ARGS_PREFIX;
        if (!raw) return [] as string[];
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        return [] as string[];
      }
    })(),
  },
});
