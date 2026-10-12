import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AiService } from '@/infra/ai/ai.service';
import { AiProviderRegistry } from '@/infra/ai/ai-provider.registry';
import { loadPrompt } from '@/infra/ai/prompt.loader';
import {
  ChatDelta,
  ChatMessage,
  ChatResult,
  ToolCall,
} from '@/infra/ai/providers/llm-provider.interface';
import { AuthUser } from '@/shared/types/auth-user';

import { AiToolsService, ToolContext } from './ai-tools.service';
import { ChatDto } from './dto/chat.dto';

/** Agent 循环上限：单条用户消息最多触发的「模型→工具」轮次 */
const MAX_TOOL_TURNS = 6;

/**
 * AI 对话（Agent 模式）：
 * 识别意图 → 模型流式产出/发起工具调用 → 后端带权限校验执行真实工具 →
 * 结果回喂模型 → 最终答案经 SSE 流式下发（工具活动以 tool 帧下发）。
 */
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly ai: AiService,
    private readonly registry: AiProviderRegistry,
    private readonly tools: AiToolsService,
    private readonly config: ConfigService,
  ) {}

  /** 同步对话：复用同一套 Agent 往返，聚合为完整文本返回 */
  async chat(userId: string, user: AuthUser, dto: ChatDto): Promise<ChatResult> {
    let content = '';
    let usage: ChatResult['usage'] = null;
    let model = '';
    for await (const frame of this.chatStream(userId, user, dto)) {
      if (frame.done) {
        usage = frame.usage ?? null;
        model = frame.model ?? '';
      } else if (frame.delta) {
        content += frame.delta;
      }
    }
    return { content, usage, finishReason: 'stop', model };
  }

  /** 流式对话（SSE）：帧含 delta / tool 活动 / done(usage+model) */
  async *chatStream(
    userId: string,
    auth: AuthUser,
    dto: ChatDto,
    signal?: AbortSignal,
  ): AsyncIterable<ChatDelta> {
    const route = await this.registry.resolve(dto.modelId, dto.model);
    const provider = route?.provider;
    const model = route?.model ?? dto.model;
    const maxTokens = route?.maxTokens;

    const ctx = await this.tools.buildContext(auth);
    const conv: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(auth, ctx) },
      ...(dto.history ?? []).slice(-20).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: dto.message },
    ];
    const toolDefs = this.tools.getTools();

    for (let turn = 0; turn <= MAX_TOOL_TURNS; turn++) {
      let assistantText = '';
      let finalUsage: ChatDelta['usage'] = null;
      let finalModel: string | undefined;
      let pendingToolCalls: ToolCall[] | undefined;

      for await (const delta of this.ai.chatStream(
        userId,
        {
          messages: conv,
          model,
          temperature: dto.temperature,
          maxTokens,
          tools: toolDefs,
          signal,
        },
        provider,
      )) {
        if (delta.done) {
          if (delta.toolCalls?.length) {
            pendingToolCalls = delta.toolCalls;
          } else {
            finalUsage = delta.usage ?? null;
            finalModel = delta.model;
          }
        } else if (delta.delta) {
          assistantText += delta.delta;
          yield delta;
        }
      }

      // 无工具调用：本轮即最终答案
      if (!pendingToolCalls?.length) {
        yield {
          delta: '',
          done: true,
          usage: finalUsage,
          model: finalModel ?? model,
        };
        return;
      }

      if (turn === MAX_TOOL_TURNS) {
        yield {
          delta: '\n\n（工具调用轮次已达上限，请把问题拆小一点再试）',
          done: false,
        };
        yield { delta: '', done: true, usage: finalUsage, model: finalModel ?? model };
        return;
      }

      // 回传 assistant 的 tool_calls，再逐个执行真实工具
      conv.push({
        role: 'assistant',
        content: assistantText || null,
        tool_calls: pendingToolCalls.map((t) => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: t.arguments },
        })),
      });

      for (const toolCall of pendingToolCalls) {
        if (signal?.aborted) {
          yield { delta: '', done: true, usage: finalUsage, model: finalModel ?? model };
          return;
        }
        yield { delta: '', done: false, tool: { name: toolCall.name, status: 'running' } };
        const result = await this.tools.execute(toolCall, ctx);
        yield {
          delta: '',
          done: false,
          tool: { name: toolCall.name, status: result.ok ? 'done' : 'error' },
        };
        this.logger.log(
          `工具执行 ${toolCall.name}: ${result.ok ? 'ok' : 'error'}（user=${auth.username}）`,
        );
        conv.push({
          role: 'tool',
          content: JSON.stringify(result.data),
          tool_call_id: toolCall.id,
        });
      }
    }
  }

  private buildSystemPrompt(auth: AuthUser, ctx: ToolContext): string {
    return loadPrompt('assistant.v1.md', {
      systemName: this.config.get<string>('app.name', '权限中枢'),
      date: new Date().toLocaleString('zh-CN'),
      userName: auth.nickname || auth.username,
      username: auth.username,
      permissions: auth.isSuper
        ? '超级管理员（拥有全部权限）'
        : [...ctx.perms].join(', ') || '（无业务权限）',
    });
  }
}
