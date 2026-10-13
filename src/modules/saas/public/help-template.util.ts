/**
 * C 端帮助中心 HTML 直出模板（TS 模板函数，零模板引擎依赖）。
 * 约定：
 * - 所有用户内容先 escapeHtml 再拼入（XSS 防护，单测覆盖）
 * - 样式内联，单页自包含（无外链资源，爬虫/离线可读）
 * - Markdown 子集渲染：标题/段落/列表/引用/代码块/行内代码/加粗/链接
 */

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 行内 Markdown（输入已转义的文本）：`code` **bold** [text](url) */
function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
      '<a href="$1" rel="noopener">$2</a>',
    );
}

/** Markdown 子集 → HTML（先转义后替换标签，杜绝注入） */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let listType: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${renderInline(escapeHtml(paragraph.join(' ')))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      flushParagraph();
      closeList();
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length + 1; // h2-h5（h1 留给页面标题）
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushParagraph();
      const want = ul ? 'ul' : 'ol';
      if (listType !== want) {
        closeList();
        out.push(`<${want}>`);
        listType = want;
      }
      out.push(`<li>${renderInline(escapeHtml((ul ?? ol)![1]))}</li>`);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      closeList();
      out.push(`<blockquote>${renderInline(escapeHtml(quote[1]))}</blockquote>`);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

const BASE_STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: #1f2329; background: #f7f8fa; line-height: 1.7; }
  a { color: #2b5cd9; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 24px 20px 64px; }
  header.site { background: #fff; border-bottom: 1px solid #e5e6eb; padding: 16px 20px; }
  header.site .inner { max-width: 860px; margin: 0 auto; display: flex; align-items: center; gap: 10px; }
  header.site .logo { width: 32px; height: 32px; border-radius: 8px; background: #2b5cd9; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
  header.site .name { font-weight: 600; font-size: 16px; }
  header.site .sub { color: #86909c; font-size: 13px; }
  h1 { font-size: 26px; margin: 28px 0 8px; }
  h2 { font-size: 20px; margin: 28px 0 10px; }
  h3 { font-size: 17px; margin: 22px 0 8px; }
  h4 { font-size: 15px; margin: 18px 0 6px; }
  p { margin: 10px 0; }
  ul, ol { padding-left: 24px; margin: 10px 0; }
  blockquote { margin: 12px 0; padding: 8px 14px; border-left: 4px solid #2b5cd9; background: #fff; color: #4e5969; }
  code { background: #f2f3f5; border-radius: 4px; padding: 1px 6px; font-size: 13px; font-family: "SFMono-Regular", Consolas, monospace; }
  pre { background: #1f2329; color: #e8eaed; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; color: inherit; padding: 0; }
  .card { background: #fff; border: 1px solid #e5e6eb; border-radius: 12px; padding: 20px 24px; margin: 14px 0; }
  .card:hover { border-color: #2b5cd9; }
  .card h2 { margin: 0 0 6px; font-size: 17px; }
  .meta { color: #86909c; font-size: 13px; }
  .tags { margin-top: 8px; }
  .tag { display: inline-block; background: #f2f3f5; color: #4e5969; border-radius: 999px; padding: 1px 10px; font-size: 12px; margin-right: 6px; }
  .crumb { color: #86909c; font-size: 13px; margin: 18px 0 0; }
  footer { color: #86909c; font-size: 12px; text-align: center; margin-top: 48px; }
  .empty { text-align: center; color: #86909c; padding: 64px 0; }
`;

export interface HelpArticleCard {
  title: string;
  slug: string;
  seoDescription: string | null;
  preview: string;
  publishedAt: Date | null;
  tags: { name: string }[];
}

function layout(opts: {
  title: string;
  description: string;
  canonical: string;
  jsonLd?: unknown;
  body: string;
}): string {
  const jsonLd = opts.jsonLd
    ? `\n<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>`
    : '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
<link rel="canonical" href="${escapeHtml(opts.canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(opts.description)}">
<meta property="og:url" content="${escapeHtml(opts.canonical)}">
<meta name="twitter:card" content="summary">
<style>${BASE_STYLE}</style>${jsonLd}
</head>
<body>
<header class="site"><div class="inner"><slot-placeholder/></div></header>
<main class="wrap">${opts.body}</main>
<footer>Powered by AI 客服平台</footer>
</body>
</html>`;
}

function siteHeader(tenantName: string, tenantCode: string, homeHref: string): string {
  const initial = escapeHtml(tenantName.slice(0, 1));
  return `<div class="logo">${initial}</div><div><div class="name">${escapeHtml(tenantName)}</div><div class="sub"><a href="${escapeHtml(homeHref)}">帮助中心</a> · ${escapeHtml(tenantCode)}</div></div>`;
}

function contentPreview(markdown: string, length = 160): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > length ? `${plain.slice(0, length)}…` : plain;
}

/** 帮助中心首页 */
export function renderHelpHome(opts: {
  tenantName: string;
  tenantCode: string;
  origin: string;
  articles: HelpArticleCard[];
}): string {
  const homeHref = `/help/${opts.tenantCode}`;
  const cards = opts.articles.length
    ? opts.articles
        .map(
          (
            a,
          ) => `<a class="card" href="${homeHref}/${escapeHtml(a.slug)}" style="display:block;color:inherit">
<h2>${escapeHtml(a.title)}</h2>
<p class="meta">${escapeHtml(a.preview)}</p>
<div class="tags">${a.tags.map((t) => `<span class="tag">${escapeHtml(t.name)}</span>`).join('')}${
            a.publishedAt
              ? `<span class="meta">${a.publishedAt.toISOString().slice(0, 10)} 更新</span>`
              : ''
          }</div></a>`,
        )
        .join('\n')
    : `<div class="empty">暂无内容，敬请期待</div>`;

  const body = `<h1>${escapeHtml(opts.tenantName)} 帮助中心</h1>
<p class="meta">常见问题与使用指南，找不到答案可直接在线咨询。</p>
${cards}`;

  const html = layout({
    title: `${opts.tenantName} · 帮助中心`,
    description: `${opts.tenantName}官方帮助中心：常见问题、使用指南与售后政策。`,
    canonical: `${opts.origin}${homeHref}`,
    body,
  }).replace('<slot-placeholder/>', siteHeader(opts.tenantName, opts.tenantCode, homeHref));
  return html;
}

/** 文章详情页（含 Article + FAQPage 结构化数据） */
export function renderHelpArticle(opts: {
  tenantName: string;
  tenantCode: string;
  origin: string;
  article: {
    title: string;
    slug: string;
    seoTitle: string | null;
    seoDescription: string | null;
    content: string;
    publishedAt: Date | null;
    tags: { name: string }[];
  };
}): string {
  const homeHref = `/help/${opts.tenantCode}`;
  const canonical = `${opts.origin}${homeHref}/${opts.article.slug}`;
  const description = opts.article.seoDescription ?? contentPreview(opts.article.content, 120);
  const html = markdownToHtml(opts.article.content);
  const faq = extractFaq(opts.article.content);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: opts.article.seoTitle ?? opts.article.title,
        description,
        url: canonical,
        datePublished: opts.article.publishedAt?.toISOString(),
        author: { '@type': 'Organization', name: opts.tenantName },
        publisher: { '@type': 'Organization', name: opts.tenantName },
      },
      ...(faq.length
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: faq.map((item) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: { '@type': 'Answer', text: item.answer },
              })),
            },
          ]
        : []),
    ],
  };

  const body = `<p class="crumb"><a href="${escapeHtml(homeHref)}">帮助中心</a> / ${escapeHtml(
    opts.article.title,
  )}</p>
<h1>${escapeHtml(opts.article.title)}</h1>
<p class="meta">${opts.article.publishedAt ? `${opts.article.publishedAt.toISOString().slice(0, 10)} 更新 · ` : ''}${opts.article.tags
    .map((t) => `<span class="tag">${escapeHtml(t.name)}</span>`)
    .join('')}</p>
<article class="card">${html}</article>`;

  return layout({
    title: `${opts.article.seoTitle ?? opts.article.title} - ${opts.tenantName}帮助中心`,
    description,
    canonical,
    jsonLd,
    body,
  }).replace('<slot-placeholder/>', siteHeader(opts.tenantName, opts.tenantCode, homeHref));
}

/** FAQ 抽取：`## 问句` + 紧随段落（可获得搜索富摘要） */
export function extractFaq(markdown: string): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h2 = /^##\s+(.*)$/.exec(lines[i].trim());
    if (!h2) continue;
    const answerLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^#{1,4}\s/.test(lines[j].trim())) break;
      if (lines[j].trim()) answerLines.push(lines[j].trim());
    }
    const answer = answerLines.join(' ').slice(0, 300);
    if (answer) out.push({ question: h2[1].trim(), answer });
  }
  return out.slice(0, 20);
}

export function renderSitemap(opts: {
  origin: string;
  tenantCode: string;
  articles: { slug: string; updatedAt: Date }[];
}): string {
  const home = `${opts.origin}/help/${opts.tenantCode}`;
  const urls = [
    `  <url><loc>${escapeHtml(home)}</loc><changefreq>daily</changefreq></url>`,
    ...opts.articles.map(
      (a) =>
        `  <url><loc>${escapeHtml(`${home}/${a.slug}`)}</loc><lastmod>${a.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`,
    ),
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

export function renderRobots(): string {
  return ['User-agent: *', 'Allow: /help/', 'Disallow: /api/', ''].join('\n');
}

export function renderNotFound(tenantName?: string): string {
  const body = `<div class="empty"><h1>404</h1><p>${
    tenantName ? escapeHtml(tenantName) : ''
  }帮助中心没有找到该页面。</p><p><a href="/">返回首页</a></p></div>`;
  return layout({ title: '页面不存在', description: '404', canonical: '', body }).replace(
    '<slot-placeholder/>',
    '',
  );
}
