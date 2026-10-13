import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Status } from '@prisma/client';
import { Request, Response } from 'express';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { Public } from '@/shared/decorators/public.decorator';
import { SkipWrap } from '@/shared/decorators/skip-wrap.decorator';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { hashApiKey } from '../api-key.util';
import { KbSearchService } from '../kb-search.service';
import { VisitorChatService } from '../visitor-chat.service';
import { chatWidgetPage, widgetScript } from './widget-scripts';

/** 相关文章推荐入参（service 内做空值防护） */
interface RelatedArticlesDto {
  q?: string;
}

/**
 * 网页挂件（公开接口，X-Api-Key / k 参数鉴权）：
 * - GET  /widget.js?k=sk-xxx   挂件脚本（宿主网站一段 script 引入）
 * - GET  /chat-widget?k=sk-xxx 挂件容器页（iframe 隔离，服务端直出）
 * - POST /saas/visitor/articles 挂件内"相关文章"推荐（X-Api-Key）
 */
@ApiTags('SaaS 网页挂件')
@Controller()
export class WidgetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visitorChat: VisitorChatService,
    private readonly kbSearch: KbSearchService,
  ) {}

  @Public()
  @SkipWrap()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('widget.js')
  @ApiOperation({ summary: '网页挂件脚本（?k=sk-xxx）' })
  @ApiSecurity('X-Api-Key')
  async widgetJs(@Query('k') key: string, @Res() res: Response): Promise<void> {
    await this.assertKey(key);
    res.setHeader('content-type', 'application/javascript; charset=utf-8');
    res.send(widgetScript());
  }

  @Public()
  @SkipWrap()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('chat-widget')
  @ApiOperation({ summary: '挂件容器页（?k=sk-xxx，供 iframe 加载）' })
  @ApiSecurity('X-Api-Key')
  async chatWidget(
    @Query('k') key: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const auth = await this.visitorChat.resolveApiKey(key);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(
      chatWidgetPage({
        apiKey: key,
        origin: this.origin(req),
        tenantName: auth.tenantName,
      }),
    );
  }

  @Public()
  @SkipWrap()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('saas/visitor/articles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '挂件相关文章推荐（X-Api-Key 鉴权，Top-5）' })
  @ApiSecurity('X-Api-Key')
  async relatedArticles(
    @Headers('x-api-key') apiKey: string,
    @Body() dto: RelatedArticlesDto,
  ): Promise<{ id: string; title: string; url: string }[]> {
    const auth = await this.visitorChat.resolveApiKey(apiKey);
    const query = typeof dto.q === 'string' ? dto.q.trim() : '';
    if (!query) return [];
    const hits = await this.kbSearch.search(query, {
      tenantId: auth.tenantId,
      limit: 5,
      previewLength: 200,
    });
    return hits.map((hit) => ({
      id: hit.id,
      title: hit.title,
      url: `/help/${auth.tenantCode}/${hit.slug}`,
    }));
  }

  private async assertKey(key: string): Promise<void> {
    if (!key) throw new NotFoundException('挂件参数缺失');
    const row = await this.prisma.tenantApiKey.findFirst({
      where: { keyHash: hashApiKey(key), deletedAt: null, status: Status.ENABLED },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.API_KEY_INVALID);
  }

  private origin(req: Request): string {
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    return `${protocol}://${req.headers.host ?? 'localhost'}`;
  }
}
