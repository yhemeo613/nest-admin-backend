import { ChatDelta, ChatParams, ChatResult, ILlmProvider } from './llm-provider.interface';

/**
 * 本地模拟 Provider（AI_PROVIDER=mock）：
 * 无需密钥即可联调前后端链路、跑通 e2e；生产环境不要使用。
 */
export class MockLlmProvider implements ILlmProvider {
  readonly name = 'mock';

  constructor(readonly defaultModel = 'mock-chat') {}

  private buildContent(params: ChatParams): string {
    const lastUser = [...params.messages].reverse().find((m) => m.role === 'user');
    return `[${params.model ?? this.defaultModel}] 已收到你的消息：「${lastUser?.content ?? ''}」。当前为 mock 本地模拟应答，配置真实厂商密钥后即可切换。`;
  }

  chat(params: ChatParams): Promise<ChatResult> {
    const content = this.buildContent(params);
    const promptTokens = params.messages.reduce((sum, m) => sum + (m.content ?? '').length, 0);
    return Promise.resolve({
      content,
      usage: {
        promptTokens,
        completionTokens: content.length,
        totalTokens: promptTokens + content.length,
      },
      finishReason: 'stop',
      model: params.model ?? this.defaultModel,
    });
  }

  async *chatStream(params: ChatParams): AsyncIterable<ChatDelta> {
    const content = this.buildContent(params);
    const chunkSize = 6;
    for (let i = 0; i < content.length; i += chunkSize) {
      yield { delta: content.slice(i, i + chunkSize), done: false };
    }
    const promptTokens = params.messages.reduce((sum, m) => sum + (m.content ?? '').length, 0);
    yield {
      delta: '',
      done: true,
      usage: {
        promptTokens,
        completionTokens: content.length,
        totalTokens: promptTokens + content.length,
      },
    };
  }

  embed(texts: string[]): Promise<number[][]> {
    // 确定性伪向量：同一文本恒定输出，便于测试
    return Promise.resolve(
      texts.map((text) => {
        const vec = new Array<number>(8).fill(0);
        for (let i = 0; i < text.length; i++) vec[i % 8] += text.charCodeAt(i);
        const norm = Math.hypot(...vec) || 1;
        return vec.map((v) => Number((v / norm).toFixed(6)));
      }),
    );
  }
}
