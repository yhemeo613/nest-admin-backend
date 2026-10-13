import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { tool, toolCallLimitMiddleware } from 'langchain';
import { createAgent } from 'langchain';
import * as z from 'zod';

import { PermissionCodeValue } from '@/shared/constants/permission-code';
import { AuthUser } from '@/shared/types/auth-user';

import { AiRegistry } from './ai.registry';
import { AiTokenUsage } from './ai-gateway.service';
import { AiUsageHandler } from './ai-usage.handler';
import { AiUsageService } from './ai-usage.service';

/** 工具执行上下文（模块层构建：登录用户 + 权限码集合） */
export interface AgentToolContext {
  user: AuthUser;
  perms: Set<string>;
}

/**
 * Agent 工具规格：模块层只描述「名称/描述/zod schema/权限码/执行函数」，
 * LangChain 装配与权限折叠（失败不中断 run，回喂 {error}）由 infra 完成。
 */
export interface AgentToolSpec {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** 所需权限码（与 PermissionsGuard 同语义：超管旁路，其余必须命中） */
  permission?: PermissionCodeValue;
  run: (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<unknown>;
}

/** Agent 统一事件帧（infra 内部协议，模块层映射为 SSE 帧） */
export type AgentFrame =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; status: 'running' | 'done' | 'error' }
  | { type: 'end'; usage: AiTokenUsage | null; model: string };

export interface RunAgentParams {
  userId: string;
  systemPrompt: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  message: string;
  modelId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  toolContext: AgentToolContext;
  tools: AgentToolSpec[];
  signal?: AbortSignal;
  /** 单条用户消息最多触发的「模型→工具」轮次上限（默认 6） */
  maxTurns?: number;
}

/**
 * 安全执行工具：权限不足/执行异常一律折叠为 {error} JSON 字符串回喂模型，绝不抛出中断 run。
 * （导出便于单测）
 */
export async function executeToolSafely(
  spec: AgentToolSpec,
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<string> {
  if (spec.permission && !ctx.user.isSuper && !ctx.perms.has(spec.permission)) {
    return JSON.stringify({ error: `权限不足，执行该操作需要 ${spec.permission} 权限` });
  }
  try {
    const data = await spec.run(args, ctx);
    return typeof data === 'string' ? data : JSON.stringify(data ?? null);
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * LangChain Agent 编排（createAgent 基于 LangGraph 的现代 harness）：
 * 模型 → 工具循环 → 最终答案；每轮模型调用自动落审计（AiUsageHandler）。
 * 模型实例来自 AiRegistry（DB/env 配置），降级由 modelFallback 策略缺失时
 * 依靠 AiRegistry 解析与调用方兜底；工具权限失败折叠为 {error} 回喂模型，不中断 run。
 */
@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    private readonly registry: AiRegistry,
    private readonly usage: AiUsageService,
  ) {}

  async *runAgent(params: RunAgentParams): AsyncIterable<AgentFrame> {
    const route =
      (await this.registry.resolve(params.modelId, params.model)) ?? this.registry.envDefault();
    const maxTurns = params.maxTurns ?? 6;

    const handler = new AiUsageHandler(this.usage, {
      userId: params.userId,
      provider: route.providerName,
      model: route.modelName,
    });

    const agent = createAgent({
      model: route.model,
      tools: params.tools.map((spec) => this.toLangChainTool(spec, params.toolContext)),
      systemPrompt: params.systemPrompt,
      middleware: [
        // 工具调用轮次上限：超出后拦截为错误信息回喂，模型收尾作答（对齐旧 MAX_TOOL_TURNS 语义）
        toolCallLimitMiddleware({ runLimit: maxTurns, exitBehavior: 'end' }),
      ],
    });

    const messages = this.toMessages(params);
    const stream = await agent.streamEvents(
      { messages },
      { callbacks: [handler], signal: params.signal, recursionLimit: maxTurns * 2 + 4 },
    );

    let usage: AiTokenUsage | null = null;
    for await (const event of stream) {
      if (params.signal?.aborted) return;

      if (event.event === 'on_chat_model_stream') {
        const chunk = (event.data as { chunk?: AIMessageChunk } | undefined)?.chunk;
        const text = typeof chunk?.content === 'string' ? chunk.content : '';
        if (text) yield { type: 'text', delta: text };
      } else if (event.event === 'on_tool_start') {
        // 工具名在事件顶层 name 字段（data 只有 input）
        yield { type: 'tool', name: String(event.name ?? ''), status: 'running' };
      } else if (event.event === 'on_tool_end') {
        yield { type: 'tool', name: String(event.name ?? ''), status: 'done' };
      } else if (event.event === 'on_tool_error') {
        const data = event.data as { error?: unknown } | undefined;
        this.logger.warn(`工具执行异常 ${String(event.name ?? '')}: ${String(data?.error ?? '')}`);
        yield { type: 'tool', name: String(event.name ?? ''), status: 'error' };
      } else if (event.event === 'on_chat_model_end' || event.event === 'on_llm_end') {
        // 每轮模型调用结束取一次用量（含工具调用轮），最后一轮即最终答案用量
        const data = event.data as
          | {
              output?: AIMessageChunk;
              response?: Parameters<AiAgentService['extractTurnUsage']>[0];
            }
          | undefined;
        const turnUsage =
          this.extractTurnUsage(data?.response) ?? this.extractMessageUsage(data?.output);
        if (turnUsage) usage = turnUsage;
      }
    }

    yield { type: 'end', usage, model: route.modelName };
  }

  private extractMessageUsage(message: AIMessageChunk | undefined): AiTokenUsage | null {
    const meta = message?.usage_metadata;
    if (!meta) return null;
    return {
      promptTokens: meta.input_tokens,
      completionTokens: meta.output_tokens,
      totalTokens: meta.total_tokens,
    };
  }

  /** 把模块层工具规格包成 LangChain 工具：权限失败/执行异常折叠为 {error} JSON 回喂模型 */
  private toLangChainTool(spec: AgentToolSpec, ctx: AgentToolContext): DynamicStructuredTool {
    return tool(async (args: Record<string, unknown>) => executeToolSafely(spec, args, ctx), {
      name: spec.name,
      description: spec.description,
      schema: spec.schema,
    }) as unknown as DynamicStructuredTool;
  }

  private toMessages(params: RunAgentParams): BaseMessage[] {
    return [
      ...params.history
        .slice(-20)
        .map((h) => (h.role === 'user' ? new HumanMessage(h.content) : new AIMessage(h.content))),
      new HumanMessage(params.message),
    ];
  }

  private extractTurnUsage(response: unknown): AiTokenUsage | null {
    const res = response as
      | {
          llmOutput?: {
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          generations?: {
            message?: {
              usage_metadata?: {
                input_tokens: number;
                output_tokens: number;
                total_tokens: number;
              };
            };
          }[][];
        }
      | undefined;
    const fromLlmOutput = res?.llmOutput?.usage;
    if (fromLlmOutput) {
      return {
        promptTokens: fromLlmOutput.prompt_tokens ?? 0,
        completionTokens: fromLlmOutput.completion_tokens ?? 0,
        totalTokens:
          fromLlmOutput.total_tokens ??
          (fromLlmOutput.prompt_tokens ?? 0) + (fromLlmOutput.completion_tokens ?? 0),
      };
    }
    for (const gens of res?.generations ?? []) {
      for (const gen of gens) {
        const meta = gen?.message?.usage_metadata;
        if (meta) {
          return {
            promptTokens: meta.input_tokens,
            completionTokens: meta.output_tokens,
            totalTokens: meta.total_tokens,
          };
        }
      }
    }
    return null;
  }
}
