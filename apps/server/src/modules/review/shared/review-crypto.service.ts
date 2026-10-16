import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';

const PREFIX = 'v1:';

/**
 * 评审域密文服务：AES-256-GCM（模型 apiKey / 仓库凭证）。
 * 密钥优先取 REVIEW_CRYPTO_KEY，缺省派生自 JWT_ACCESS_SECRET（sha256 → 32B）；
 * 派生密钥变更会导致旧密文解不开（抛 REVIEW_CRYPTO_KEY_INVALID）。
 */
@Injectable()
export class ReviewCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw =
      config.get<string>('review.cryptoKey') || config.get<string>('jwt.accessSecret') || '';
    this.key = createHash('sha256').update(raw).digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
  }

  decrypt(enc: string | null | undefined): string | null {
    if (!enc) return null;
    if (!enc.startsWith(PREFIX)) throw new BusinessException(ErrorCode.REVIEW_CRYPTO_KEY_INVALID);
    try {
      const buf = Buffer.from(enc.slice(PREFIX.length), 'base64');
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const ct = buf.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
      throw new BusinessException(ErrorCode.REVIEW_CRYPTO_KEY_INVALID);
    }
  }
}
