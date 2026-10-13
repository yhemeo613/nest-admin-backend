/**
 * AI 真实链路冒烟测试（不进 CI）：
 *   pnpm test:ai:smoke
 * 读取 .env.development 的 AI_* 配置与数据库「模型配置」，依次验证 chat / chatStream / embed。
 * LangChain 架构下走 AiGateway 门面（含审计落库）。
 */
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { config as loadEnv } from 'dotenv';

import configuration from '../src/config/configuration';
import { AiRegistry } from '../src/infra/ai/ai.registry';
import { AiGateway } from '../src/infra/ai/ai-gateway.service';
import { AiUsageService } from '../src/infra/ai/ai-usage.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';

loadEnv({ path: '.env.development' });
loadEnv();

const cfg = configuration() as Record<string, Record<string, unknown>>;
const fakeConfig = {
  get: (key: string, defaultValue?: unknown) =>
    key.split('.').reduce<unknown>((obj, k) => (obj as Record<string, unknown>)?.[k], cfg) ??
    defaultValue,
} as ConfigService;

async function main(): Promise<void> {
  const prisma = new PrismaService(fakeConfig);
  const registry = new AiRegistry(prisma, fakeConfig);
  const usage = new AiUsageService(prisma, new EventEmitter2());
  const gateway = new AiGateway(registry, usage);

  const route = (await registry.resolve()) ?? registry.envDefault();
  console.log(`==> 模型: ${route.modelName}（厂商 ${route.providerName}）`);

  // 1. 同步对话
  const startedAt = Date.now();
  const result = await gateway.chat('ai-smoke', {
    messages: [{ role: 'user', content: '用一句话介绍 NestJS' }],
    maxTokens: 1024,
  });
  console.log(`==> chat 成功（${Date.now() - startedAt}ms，模型 ${result.model}）`);
  console.log(
    `    内容: ${result.content.slice(0, 120)}${result.content.length > 120 ? '...' : ''}`,
  );
  console.log(`    用量: ${JSON.stringify(result.usage)}`);

  // 2. 流式对话
  let streamed = '';
  let usageOut: unknown = null;
  for await (const delta of gateway.chatStream('ai-smoke', {
    messages: [{ role: 'user', content: '用一句话介绍 TypeScript' }],
    maxTokens: 1024,
  })) {
    if (delta.done) usageOut = delta.usage;
    else streamed += delta.delta;
  }
  console.log(`==> chatStream 成功，共 ${streamed.length} 字符`);
  console.log(`    内容: ${streamed.slice(0, 120)}${streamed.length > 120 ? '...' : ''}`);
  console.log(`    用量: ${JSON.stringify(usageOut)}`);

  // 3. 向量化（部分厂商无 embedding 模型，失败仅提示不判负）
  try {
    const vectors = await gateway.embed(['你好']);
    console.log(`==> embed 成功，维度 ${vectors[0]?.length}`);
  } catch (error) {
    console.log(
      `==> embed 不可用（该厂商可能无 embedding 模型）: ${error instanceof Error ? error.message : error}`,
    );
  }

  await prisma.$disconnect();
  console.log('==> 冒烟测试通过');
}

main().catch((error: unknown) => {
  console.error('==> 冒烟测试失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
