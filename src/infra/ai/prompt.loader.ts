import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Prompt 模板加载器（约定见 AGENTS.md §3.6）：
 * Prompt 只放 src/infra/ai/prompts/{场景}.v{N}.md，占位符 {{var}}。
 * 开发态从 src 读取，生产态从 dist 读取（nest-cli.json assets 已复制）。
 */
const cache = new Map<string, string>();

export function loadPrompt(template: string, vars: Record<string, string | number>): string {
  let tpl = cache.get(template);
  if (!tpl) {
    const candidates = [
      join(process.cwd(), 'src', 'infra', 'ai', 'prompts', template),
      join(process.cwd(), 'dist', 'infra', 'ai', 'prompts', template),
    ];
    const file = candidates.find((p) => existsSync(p));
    if (!file) {
      throw new Error(`Prompt 模板不存在: ${template}`);
    }
    tpl = readFileSync(file, 'utf8');
    cache.set(template, tpl);
  }
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''));
}
