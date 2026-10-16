import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { ReviewCryptoService } from './review-crypto.service';

function createService(secret: string): ReviewCryptoService {
  const config = {
    get: jest.fn((key: string) =>
      key === 'review.cryptoKey' ? '' : key === 'jwt.accessSecret' ? secret : undefined,
    ),
  };
  return new ReviewCryptoService(config as unknown as ConfigService);
}

describe('ReviewCryptoService AES-256-GCM', () => {
  it('encrypt → decrypt 往返一致，且密文不含明文', () => {
    const svc = createService('test-secret-32bytes-at-least-16xx');
    const plain = 'sk-abcdef123456:user:token@x';
    const enc = svc.encrypt(plain);
    expect(enc).not.toContain(plain);
    expect(enc.startsWith('v1:')).toBe(true);
    expect(svc.decrypt(enc)).toBe(plain);
  });

  it('不同密钥解密失败抛 REVIEW_CRYPTO_KEY_INVALID', () => {
    const a = createService('secret-a-aaaaaaaaaaaaaaaaaaaaaaaa');
    const b = createService('secret-b-bbbbbbbbbbbbbbbbbbbbbbbbb');
    const enc = a.encrypt('data');
    expect(() => b.decrypt(enc)).toThrow(BusinessException);
    try {
      b.decrypt(enc);
    } catch (e) {
      expect((e as BusinessException).bizCode).toBe(ErrorCode.REVIEW_CRYPTO_KEY_INVALID);
    }
  });

  it('null/空串解密返回 null；损坏密文抛错', () => {
    const svc = createService('test-secret-32bytes-at-least-16xx');
    expect(svc.decrypt(null)).toBeNull();
    expect(svc.decrypt(undefined)).toBeNull();
    expect(svc.decrypt('')).toBeNull();
    expect(() => svc.decrypt('v1:corrupted-base64!!!')).toThrow(BusinessException);
    expect(() => svc.decrypt('no-prefix')).toThrow(BusinessException);
  });
});
