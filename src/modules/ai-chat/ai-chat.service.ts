import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AgentFrame, AiAgentService } from '@/infra/ai/ai-agent.service';
import { AiTokenUsage } from '@/infra/ai/ai-gateway.service';
import { loadPrompt } from '@/infra/ai/prompt.loader';
import { AuthUser } from '@/shared/types/auth-user';

import { AiToolsService, ToolContext } from './ai-tools.service';
import { ChatDto } from './dto/chat.dto';

/** Agent 帧 → SSE 帧（对外契约与旧版一致） */
export interface ChatSseDelta {
  delta: string;
  done: boolean;
  usage?: AiTokenUsage | null;
  model?: string;
  tool?: { name: string; status: 'running' | 'done' | 'error' };
}

/**
 * AI 对话（LangChain Agent）：
 * 意图识别 → LangChain createAgent 工具循环（infra 装配与权限折叠）→
 * 最终答案经 SSE 流式下发（工具活动以 tool 帧下发，契约与旧版一致）。
 */
@Injectable()
export class AiChatService {
  constructor(
    private readonly agent: AiAgentService,
    private readonly tools: AiToolsService,
    private readonly config: ConfigService,
  ) {}

  /** 同步对话：复用流式路径聚合为完整文本 */
  async chat(
    user: AuthUser,
    dto: ChatDto,
  ): Promise<{
    content: string;
    usage: AiTokenUsage | null;
    model: string;
  }> {
    let content = '';
    let usage: AiTokenUsage | null = null;
    let model = '';
    for await (const frame of this.chatStream(user, dto)) {
      if (frame.done) {
        usage = frame.usage ?? null;
        model = frame.model ?? '';
      } else if (frame.delta) {
        content += frame.delta;
      }
    }
    return { content, usage, model };
  }

  /** 流式对话（SSE）：帧含 delta / tool 活动 / done(usage+model) */
  async *chatStream(
    auth: AuthUser,
    dto: ChatDto,
    signal?: AbortSignal,
  ): AsyncIterable<ChatSseDelta> {
    const ctx = await this.tools.buildContext(auth);
    const frames = this.agent.runAgent({
      userId: auth.userId,
      systemPrompt: this.buildSystemPrompt(auth, ctx),
      history: (dto.history ?? []).map((h) => ({ role: h.role, content: h.content })),
      message: dto.message,
      modelId: dto.modelId,
      model: dto.model,
      temperature: dto.temperature,
      toolContext: ctx,
      tools: this.tools.toAgentSpecs(),
      ...(signal ? { signal } : {}),
    });

    for await (const frame of frames) {
      yield this.toSseDelta(frame);
    }
  }

  private toSseDelta(frame: AgentFrame): ChatSseDelta {
    switch (frame.type) {
      case 'text':
        return { delta: frame.delta, done: false };
      case 'tool':
        return { delta: '', done: false, tool: { name: frame.name, status: frame.status } };
      case 'end':
        return { delta: '', done: true, usage: frame.usage, model: frame.model };
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
