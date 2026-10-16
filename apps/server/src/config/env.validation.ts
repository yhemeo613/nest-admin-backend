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

  // 代码评审（NestReview）
  REVIEW_CRYPTO_KEY: Joi.string()
    .min(32)
    .allow('')
    .optional()
    .description(
      '评审域密文密钥（32+ 字符）；缺省时派生自 JWT_ACCESS_SECRET（仅建议生产显式配置）',
    ),
  OCR_BIN_PATH: Joi.string().default('ocr'),
  REVIEW_WORKSPACE_DIR: Joi.string().default('workspaces/review'),
  REVIEW_TASK_TIMEOUT_MS: Joi.number().positive().default(1800000),
  REVIEW_WORKER_CONCURRENCY: Joi.number().positive().default(1),
  // e2e/包装器：附加在 ocr bin 后的前缀参数（JSON 数组，如 ["test/fake-ocr.js"]）
  OCR_BIN_ARGS_PREFIX: Joi.string().allow('').optional(),
});
