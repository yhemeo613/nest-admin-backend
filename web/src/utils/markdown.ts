import MarkdownIt from 'markdown-it'

/**
 * 轻量 Markdown 渲染（AI 对话消息用）。
 * - html: false → 原始 HTML 一律转义，防 XSS
 * - breaks: true → 单换行即 <br>，贴近聊天语感
 * 代码块高亮/复制由 v-highlight 指令在渲染后的 DOM 上处理。
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
})

export function renderMarkdown(content: string): string {
  return md.render(content || '')
}
