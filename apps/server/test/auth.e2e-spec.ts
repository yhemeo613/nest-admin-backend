import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';

/**
 * 认证 + 权限链路 e2e。
 * 前置条件：测试库与 Redis 已就绪（docker compose up -d），且已执行
 *   NODE_ENV=test pnpm prisma:migrate && pnpm prisma:seed
 * 内置账号：admin/Admin@123（超管）、demo/Demo@123（仅 AI 对话权限）。
 */
describe('Auth & Permissions (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (username: string, password: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });

  it('无 token 访问受保护接口 → 401 + 40101', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/system/users');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(40101);
    expect(res.body.traceId).toBeDefined();
  });

  it('admin 登录成功，返回双 Token 与统一响应结构', async () => {
    const res = await login('admin', 'Admin@123');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('密码错误返回业务错误码 10001', async () => {
    const res = await login('admin', 'wrong-password');
    expect(res.body.code).toBe(10001);
  });

  it('profile 返回权限码与菜单树', async () => {
    const { body } = await login('admin', 'Admin@123');
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${body.data.accessToken}`);
    expect(res.body.data.user.username).toBe('admin');
    expect(res.body.data.permissions).toContain('system:user:list');
    expect(res.body.data.menus.length).toBeGreaterThan(0);
  });

  it('普通用户（demo）删除用户接口 → 40301；AI 对话接口放行', async () => {
    const { body } = await login('demo', 'Demo@123');
    const token = body.data.accessToken;

    const forbidden = await request(app.getHttpServer())
      .delete('/api/v1/system/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe(40301);

    const allowed = await request(app.getHttpServer())
      .post('/api/v1/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '你好' });
    expect(allowed.status).toBe(201);
    expect(allowed.body.code).toBe(0);
  });

  it('登出后刷新令牌立即失效', async () => {
    const { body } = await login('demo', 'Demo@123');
    const { accessToken, refreshToken } = body.data;

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(res.body.code).toBe(40102);
  });
});
