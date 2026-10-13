import { Controller, Get, Header, NotFoundException, Param, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { Public } from '@/shared/decorators/public.decorator';
import { SkipWrap } from '@/shared/decorators/skip-wrap.decorator';

import {
  renderHelpArticle,
  renderHelpHome,
  renderNotFound,
  renderRobots,
  renderSitemap,
} from './help-template.util';
import { PublicService } from './public.service';

/**
 * C 端帮助中心（服务端直出 HTML，可被搜索引擎抓取）：
 * /help/{tenantCode} 列表 · /help/{tenantCode}/{slug} 文章 · sitemap.xml · robots.txt
 * 全部 @Public + 限流；仅展示「租户启用 + 文章已发布」内容。
 */
@ApiTags('SaaS 帮助中心(公开)')
@Controller()
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Public()
  @SkipWrap()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('robots.txt')
  @Header('content-type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'robots.txt（允许抓取 /help/）' })
  robots(): string {
    return renderRobots();
  }

  @Public()
  @SkipWrap()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('help/:tenantCode/sitemap.xml')
  @Header('content-type', 'application/xml; charset=utf-8')
  @ApiOperation({ summary: '帮助中心 sitemap.xml' })
  async sitemap(
    @Param('tenantCode') tenantCode: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const tenant = await this.publicService.findTenant(tenantCode);
    if (!tenant) throw new NotFoundException('页面不存在');
    const articles = await this.publicService.sitemapArticles(tenant.id);
    res.send(
      renderSitemap({
        origin: this.origin(req),
        tenantCode: tenant.code,
        articles,
      }),
    );
  }

  @Public()
  @SkipWrap()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('help/:tenantCode')
  @Header('content-type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: '帮助中心首页（服务端直出，可 SEO）' })
  async home(
    @Param('tenantCode') tenantCode: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const tenant = await this.publicService.findTenant(tenantCode);
    if (!tenant) {
      res.status(404).send(renderNotFound());
      return;
    }
    const articles = await this.publicService.homeCards(tenant.id);
    res.send(
      renderHelpHome({
        tenantName: tenant.name,
        tenantCode: tenant.code,
        origin: this.origin(req),
        articles,
      }),
    );
  }

  @Public()
  @SkipWrap()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('help/:tenantCode/:slug')
  @Header('content-type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: '帮助中心文章页（服务端直出，含 JSON-LD，可 SEO）' })
  async article(
    @Param('tenantCode') tenantCode: string,
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const tenant = await this.publicService.findTenant(tenantCode);
    if (!tenant) {
      res.status(404).send(renderNotFound());
      return;
    }
    const article = await this.publicService.article(tenant.id, slug);
    if (!article) {
      res.status(404).send(renderNotFound(tenant.name));
      return;
    }
    res.send(
      renderHelpArticle({
        tenantName: tenant.name,
        tenantCode: tenant.code,
        origin: this.origin(req),
        article,
      }),
    );
  }

  private origin(req: Request): string {
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    return `${protocol}://${host ?? 'localhost'}`;
  }
}
