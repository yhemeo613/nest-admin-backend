import { Injectable } from '@nestjs/common';

import { AiService } from '@/infra/ai/ai.service';
import { ChatDelta, ChatResult } from '@/infra/ai/providers/llm-provider.interface';

import { ChatDto } from './dto/chat.dto';

@Injectable()
export class AiChatService {
  constructor(private readonly ai: AiService) {}

  chat(userId: string, dto: ChatDto): Promise<ChatResult> {
    return this.ai.chat(userId, {
      messages: [{ role: 'user', content: dto.message }],
      model: dto.model,
      temperature: dto.temperature,
    });
  }

  chatStream(userId: string, dto: ChatDto, signal?: AbortSignal): AsyncIterable<ChatDelta> {
    return this.ai.chatStream(userId, {
      messages: [{ role: 'user', content: dto.message }],
      model: dto.model,
      temperature: dto.temperature,
      signal,
    });
  }
}
