import { ConfigService } from '@nestjs/config';

import { OLLAMA_DEFAULT_BASE_URL, PROVIDER_BASE_URLS } from '../ai.constants';
import { ILlmProvider } from './llm-provider.interface';
import { MockLlmProvider } from './mock.provider';
import { OllamaProvider } from './ollama.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

/**
 * Provider 工厂：按 AI_PROVIDER 装配实现。
 * 换厂商 = 改 .env 配置，零代码改动；新增厂商 = 实现 ILlmProvider 并在此注册。
 */
export function createLlmProvider(config: ConfigService): ILlmProvider {
  const provider = config.get<string>('ai.provider', 'mock');
  const model = config.get<string>('ai.model', 'gpt-4o-mini');
  const embeddingModel = config.get<string>('ai.embeddingModel', '') || undefined;
  const timeoutMs = config.get<number>('ai.timeoutMs', 60_000);
  const baseUrl = config.get<string>('ai.baseUrl', '');
  const apiKey = config.get<string>('ai.apiKey', '');

  if (provider === 'mock') return new MockLlmProvider(model);

  if (provider === 'ollama') {
    return new OllamaProvider({
      baseURL: baseUrl || OLLAMA_DEFAULT_BASE_URL,
      model,
      embeddingModel,
      timeoutMs,
    });
  }

  return new OpenAiCompatibleProvider({
    name: provider,
    apiKey,
    baseURL: baseUrl || PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS.openai,
    model,
    embeddingModel,
    timeoutMs,
  });
}
