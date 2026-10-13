import { createHash, randomBytes } from 'node:crypto';

/** 生成访客接入 Key（明文只在创建响应中出现一次） */
export function generateApiKey(): string {
  return `sk-${randomBytes(24).toString('hex')}`;
}

/** Key 持久化指纹：库里只存 sha256，杜绝明文落库 */
export function hashApiKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

/** 展示用前缀：sk-xxxxx…（不足以还原明文） */
export function apiKeyPrefix(plain: string): string {
  return plain.slice(0, 8);
}
