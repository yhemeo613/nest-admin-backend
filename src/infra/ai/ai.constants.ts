/** AI 基础设施常量 */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/** 各厂商 OpenAI 兼容协议的默认接入地址 */
export const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  moonshot: 'https://api.moonshot.cn/v1',
  mimo: 'https://token-plan-cn.xiaomimimo.com/v1',
};

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * 模型单价表（元 / 1M tokens），用于成本估算。
 * 价格随厂商调价变动，按需在配置/代码中维护。
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 1.1, output: 4.4 },
  'gpt-4o': { input: 18, output: 72 },
  'deepseek-chat': { input: 2, output: 8 },
  'deepseek-reasoner': { input: 4, output: 16 },
  'qwen-plus': { input: 0.8, output: 2 },
  'qwen-max': { input: 20, output: 60 },
  'glm-4-plus': { input: 5, output: 5 },
  'moonshot-v1-8k': { input: 12, output: 12 },
};

/** 根据模型估算单次调用成本（元），未知模型返回 null */
export function estimateCost(
  model: string,
  usage: { promptTokens: number; completionTokens: number },
): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  const cost =
    (usage.promptTokens / 1_000_000) * pricing.input +
    (usage.completionTokens / 1_000_000) * pricing.output;
  return Number(cost.toFixed(6));
}
