import {
  escapeHtml,
  extractFaq,
  markdownToHtml,
  renderHelpArticle,
  renderHelpHome,
  renderRobots,
  renderSitemap,
} from './help-template.util';

describe('help-template（C 端直出模板）', () => {
  it('escapeHtml 转义全部危险字符', () => {
    expect(escapeHtml('<script>alert("x")</script>&\'')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;',
    );
  });

  it('markdownToHtml：先转义后渲染，注入脚本不会变成真实标签', () => {
    const html = markdownToHtml('## 标题\n\n<script>alert(1)</script>\n\n- 列表项');
    expect(html).toContain('<h3>标题</h3>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('<li>列表项</li>');
  });

  it('markdownToHtml：代码块与行内代码', () => {
    const html = markdownToHtml('```js\nconst a = 1 < 2;\n```\n\n用 `code` 标记');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('1 &lt; 2');
    expect(html).toContain('<code>code</code>');
  });

  it('extractFaq：抽取 ## 问句 + 段落', () => {
    const faq = extractFaq(
      '## 如何退货？\n\n七天内联系客服申请。\n\n## 如何开发票？\n\n下单时备注税号。',
    );
    expect(faq).toHaveLength(2);
    expect(faq[0]).toEqual({ question: '如何退货？', answer: '七天内联系客服申请。' });
  });

  it('renderHelpHome：含 canonical/OG 与文章卡片', () => {
    const html = renderHelpHome({
      tenantName: '星辰电商',
      tenantCode: 'xingchen',
      origin: 'http://localhost:3000',
      articles: [
        {
          title: '退货政策',
          slug: 'return-policy',
          seoDescription: null,
          preview: '七天无理由退货',
          publishedAt: new Date('2026-10-01'),
          tags: [{ name: '售后' }],
        },
      ],
    });
    expect(html).toContain('<title>星辰电商 · 帮助中心</title>');
    expect(html).toContain('rel="canonical" href="http://localhost:3000/help/xingchen"');
    expect(html).toContain('href="/help/xingchen/return-policy"');
    expect(html).toContain('<span class="tag">售后</span>');
  });

  it('renderHelpArticle：输出 Article + FAQPage JSON-LD', () => {
    const html = renderHelpArticle({
      tenantName: '星辰电商',
      tenantCode: 'xingchen',
      origin: 'http://localhost:3000',
      article: {
        title: '退货政策',
        slug: 'return-policy',
        seoTitle: null,
        seoDescription: null,
        content: '## 能退货吗？\n\n支持七天无理由。',
        publishedAt: new Date('2026-10-01'),
        tags: [],
      },
    });
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('能退货吗？');
    expect(html).toContain(
      'rel="canonical" href="http://localhost:3000/help/xingchen/return-policy"',
    );
  });

  it('renderSitemap / renderRobots 输出合法内容', () => {
    const sitemap = renderSitemap({
      origin: 'http://localhost:3000',
      tenantCode: 'xingchen',
      articles: [{ slug: 'a-1', updatedAt: new Date('2026-10-01') }],
    });
    expect(sitemap).toContain('<loc>http://localhost:3000/help/xingchen/a-1</loc>');
    expect(renderRobots()).toContain('Allow: /help/');
  });
});
