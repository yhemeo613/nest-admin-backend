<!-- AI 消息 Markdown 渲染（html 转义防 XSS + v-highlight 代码高亮/复制） -->
<template>
  <div class="ai-markdown text-sm leading-6" v-highlight v-html="html" />
</template>

<script setup lang="ts">
  import { renderMarkdown } from '@/utils/markdown'

  defineOptions({ name: 'AiMarkdown' })

  const props = defineProps<{
    /** 原始 Markdown 文本 */
    content: string
  }>()

  const html = computed(() => renderMarkdown(props.content))
</script>

<style lang="scss" scoped>
  .ai-markdown {
    :deep(p) {
      margin: 0 0 8px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    :deep(pre) {
      padding: 12px;
      margin: 8px 0;
      overflow-x: auto;
      font-size: 13px;
      background: var(--art-gray-100);
      border-radius: 8px;
    }

    :deep(code) {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 13px;
    }

    :deep(ul),
    :deep(ol) {
      padding-left: 22px;
      margin: 6px 0;
    }

    :deep(li) {
      margin: 2px 0;
    }

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4) {
      margin: 14px 0 8px;
      font-weight: 600;
      line-height: 1.4;
    }

    :deep(h1) {
      font-size: 20px;
    }

    :deep(h2) {
      font-size: 18px;
    }

    :deep(h3) {
      font-size: 16px;
    }

    :deep(blockquote) {
      padding: 6px 12px;
      margin: 8px 0;
      color: var(--art-gray-600);
      background: var(--art-gray-100);
      border-left: 3px solid var(--art-gray-300);
      border-radius: 0 6px 6px 0;
    }

    :deep(table) {
      margin: 8px 0;
      font-size: 13px;
      border-collapse: collapse;
    }

    :deep(th),
    :deep(td) {
      padding: 6px 12px;
      border: 1px solid var(--art-gray-200);
    }

    :deep(th) {
      font-weight: 600;
      background: var(--art-gray-100);
    }

    :deep(a) {
      color: var(--main-color);
    }

    :deep(img) {
      max-width: 100%;
      border-radius: 8px;
    }
  }
</style>
