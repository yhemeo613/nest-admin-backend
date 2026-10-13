import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import {
  BaseChatModel,
  BaseChatModelCallOptions,
  BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs';

/**
 * Mock 聊天模型：env AI_PROVIDER=mock / 单测 / e2e 无密钥联调用。
 * 行为对齐旧 MockLlmProvider：回显最后一条用户消息，按 6 字符切片流式输出，估算用量。
 * 不产生 tool_calls（工具循环在 mock 下不会触发）。
 */
export class MockChatModel extends BaseChatModel<BaseChatModelCallOptions> {
  readonly modelName: string;

  constructor(model = 'mock-chat', params?: BaseChatModelParams) {
    super(params ?? {});
    this.modelName = model;
  }

  _llmType(): string {
    return 'mock';
  }

  bindTools(): this {
    // mock 不模拟 function calling，静默忽略工具绑定
    return this;
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const message = this.mockReply(messages);
    return {
      generations: [{ text: message.content as string, message }],
      llmOutput: { model: this.modelName, usage: message.usage_metadata },
    };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const content = (this.mockReply(messages).content as string) ?? '';
    for (let i = 0; i < content.length; i += 6) {
      const piece = content.slice(i, i + 6);
      yield new ChatGenerationChunk({
        message: new AIMessageChunk({ content: piece }),
        text: piece,
      });
      await runManager?.handleLLMNewToken(piece);
    }
  }

  /** 与旧 Mock 语义一致：取最后一条 HumanMessage 回显 */
  private mockReply(messages: BaseMessage[]): AIMessage {
    let lastUser = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i] instanceof HumanMessage) {
        lastUser = String(messages[i].content ?? '');
        break;
      }
    }
    const content = `[mock] 已收到你的消息：「${lastUser}」。当前为 mock 本地模拟应答，未接入真实模型。`;
    return new AIMessage({ content, usage_metadata: this.estimateUsage(content) });
  }

  private estimateUsage(content: string) {
    const inputTokens = 10;
    const outputTokens = Math.ceil(content.length / 2);
    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    };
  }
}
