import * as Joi from 'joi';

/** 启动时校验环境变量，缺失/非法直接拒绝启动（Fail Fast） */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  APP_PORT: Joi.number().port().default(3000),
  CORS_ORIGIN: Joi.string().allow('').default(''),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),

  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().default(7200),
  JWT_REFRESH_TTL_SECONDS: Joi.number().default(604800),

  THROTTLE_TTL_MS: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),

  AI_PROVIDER: Joi.string()
    .valid('mock', 'openai', 'deepseek', 'qwen', 'zhipu', 'moonshot', 'mimo', 'ollama')
    .default('mock'),
  AI_API_KEY: Joi.string().allow('').default(''),
  AI_BASE_URL: Joi.string().allow('').default(''),
  AI_MODEL: Joi.string().default('gpt-4o-mini'),
  AI_EMBEDDING_MODEL: Joi.string().allow('').default(''),
  AI_FALLBACK_MODEL: Joi.string().allow('').default(''),
  AI_TIMEOUT_MS: Joi.number().default(60000),
  AI_MAX_TOKENS: Joi.number().default(2048),
});
