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
  ai: {
    provider: process.env.AI_PROVIDER ?? 'mock',
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: process.env.AI_BASE_URL ?? '',
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
    embeddingModel: process.env.AI_EMBEDDING_MODEL ?? '',
    fallbackModel: process.env.AI_FALLBACK_MODEL ?? '',
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS ?? '60000', 10),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS ?? '2048', 10),
  },
});
