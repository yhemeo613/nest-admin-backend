import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';

/**
 * 评审平台全链路 e2e（fake-ocr，无 LLM key 依赖）：
 * 建模型 → 建仓库（file:// 本地 git fixture）→ 建任务 → 轮询完成 →
 * findings/trace/gate/manifest/diff → 状态流转 → 红线 FAIL 路径。
 * 前置：NODE_ENV=test 的测试库已迁移+seed（见 AGENTS §4.6）。
 */
describe('NestReview (e2e, fake-ocr)', () => {
  let app: INestApplication;
  let token: string;
  let repoFixtureDir: string;

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    // git fixture：base 提交 + head 提交（制造 diff）
    repoFixtureDir = mkdtempSync(path.join(tmpdir(), 'nestreview-repo-'));
    const git = (args: string[]) =>
      execFileSync('git', args, { cwd: repoFixtureDir, stdio: 'pipe' });
    git(['init', '-b', 'main']);
    git(['config', 'user.email', 'e2e@test.local']);
    git(['config', 'user.name', 'e2e']);
    writeFileSync(path.join(repoFixtureDir, 'a.ts'), 'export const a = 1;\n');
    git(['add', '.']);
    git(['commit', '-m', 'base']);
    git(['tag', 'base']);
    writeFileSync(
      path.join(repoFixtureDir, 'a.ts'),
      'export const a = 2;\nexport const data = list.length;\n',
    );
    writeFileSync(path.join(repoFixtureDir, 'b.ts'), 'export function doit() { return 42; }\n');
    git(['add', '.']);
    git(['commit', '-m', 'head']);
    git(['tag', 'head']);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const res = await api()
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'Admin@123' });
    token = res.body.data.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (repoFixtureDir) rmSync(repoFixtureDir, { recursive: true, force: true });
  });

  let modelId: string;
  let repoId: string;
  let taskId: string;

  it('无权限访问评审接口 → 401', async () => {
    const res = await api().get('/api/v1/review/tasks');
    expect(res.status).toBe(401);
  });

  it('创建模型配置', async () => {
    const res = await api().post('/api/v1/review/models').set(auth()).send({
      name: 'e2e-fake',
      provider: 'openai',
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:1/v1',
      apiKey: 'sk-fake',
      model: 'fake-model',
      isDefault: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.hasApiKey).toBe(true);
    expect(JSON.stringify(res.body.data)).not.toContain('sk-fake');
    modelId = res.body.data.id;
  });

  it('创建仓库（file:// fixture）', async () => {
    const res = await api()
      .post('/api/v1/review/repos')
      .set(auth())
      .send({
        name: 'e2e-fixture',
        platform: 'GITLAB',
        gitUrl: pathToFileURL(repoFixtureDir).toString(),
        defaultBranch: 'main',
      });
    expect(res.status).toBe(201);
    repoId = res.body.data.id;
  });

  it('同步仓库工作区 → READY', async () => {
    const res = await api().post(`/api/v1/review/repos/${repoId}/sync`).set(auth());
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.workspaceStatus).toBe('READY');
  }, 60_000);

  it('配置红线：critical 零容忍', async () => {
    const res = await api()
      .post('/api/v1/review/gates')
      .set(auth())
      .send({ maxCritical: 0, maxHigh: 5 });
    expect(res.status).toBe(201);
  });

  it('创建评审任务（RANGE base..head）', async () => {
    const res = await api()
      .post('/api/v1/review/tasks')
      .set(auth())
      .send({ repoId, modelId, mode: 'RANGE', fromRef: 'base', toRef: 'head' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    taskId = res.body.data.id;
  });

  it('任务执行至 SUCCESS（轮询，fake-ocr 秒回）', async () => {
    const deadline = Date.now() + 60_000;
    let status = '';
    while (Date.now() < deadline) {
      const res = await api().get(`/api/v1/review/tasks/${taskId}`).set(auth());
      status = res.body.data.status;
      if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(status).toBe('SUCCESS');

    const detail = (await api().get(`/api/v1/review/tasks/${taskId}`).set(auth())).body.data;
    expect(detail.stats.comments).toBe(2);
    expect(detail.sessionId).toBe('e2e-session-0001');
    expect(detail.gateStatus).toBe('FAIL'); // critical=1 > maxCritical=0
    expect(detail.severityCount.critical).toBe(1);
  }, 90_000);

  it('发现列表：2 条，含 thinking/建议代码', async () => {
    const res = await api().get(`/api/v1/review/tasks/${taskId}/findings`).set(auth());
    expect(res.body.data).toHaveLength(2);
    const critical = res.body.data.find((f: { severity: string }) => f.severity === 'critical');
    expect(critical.path).toBe('src/a.ts');
    expect(critical.thinking).toContain('判空');
    expect(critical.suggestionCode).toContain('data?.length');
    expect(critical.isNew).toBe(true);
  });

  it('执行轨迹：2 次 LLM 调用 + 单次详情含思维链', async () => {
    const calls = (await api().get(`/api/v1/review/tasks/${taskId}/trace/calls`).set(auth())).body
      .data;
    expect(calls).toHaveLength(2);
    expect(calls[0].taskType).toBe('MAIN_TASK');
    expect(calls[0].tokensIn).toBe(100);

    const detail = (await api().get(`/api/v1/review/tasks/${taskId}/trace/call/1`).set(auth())).body
      .data;
    expect(detail.request_body.messages).toHaveLength(2);
    expect(detail.response_body.usage.completion_tokens).toBe(42);
  });

  it('manifest 覆盖率 + diff 内容', async () => {
    const manifest = (await api().get(`/api/v1/review/tasks/${taskId}/manifest`).set(auth())).body
      .data;
    expect(manifest.items).toHaveLength(2);

    const diff = await api().get(`/api/v1/review/tasks/${taskId}/diff`).set(auth());
    expect(diff.text).toContain('a.ts');
    expect(diff.text).toContain('doit');
  });

  it('发现状态流转 OPEN → FIXED', async () => {
    const list = (await api().get(`/api/v1/review/tasks/${taskId}/findings`).set(auth())).body.data;
    const res = await api()
      .patch(`/api/v1/review/findings/${list[0].id}`)
      .set(auth())
      .send({ status: 'FIXED' });
    expect(res.status).toBe(200);

    const filtered = (
      await api().get(`/api/v1/review/tasks/${taskId}/findings?status=FIXED`).set(auth())
    ).body.data;
    expect(filtered).toHaveLength(1);
  });

  it('gate 查询接口返回 FAIL 结论（供 CI）', async () => {
    const res = await api().get(`/api/v1/review/tasks/${taskId}/gate`).set(auth());
    expect(res.body.data.gateStatus).toBe('FAIL');
    expect(res.body.data.gateDetail.reasons[0]).toContain('critical');
  });

  it('demo（只读角色）不能创建任务', async () => {
    const demoLogin = await api()
      .post('/api/v1/auth/login')
      .send({ username: 'demo', password: 'Demo@123' });
    const res = await api()
      .post('/api/v1/review/tasks')
      .set({ Authorization: `Bearer ${demoLogin.body.data.accessToken}` })
      .send({ repoId, mode: 'RANGE', fromRef: 'base', toRef: 'head' });
    expect(res.body.code).toBe(40301);
  });
});
