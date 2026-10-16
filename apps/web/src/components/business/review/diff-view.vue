<template>
  <!-- diff2html.html() 静态渲染任务 diff.patch；anchor 滚动定位高亮行 -->
  <div class="diff-view" ref="containerRef">
    <ElEmpty v-if="!diffText" description="暂无 diff 内容" />
    <div v-else class="diff-html" v-html="diffHtml" />
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import { html } from 'diff2html'
  import 'diff2html/bundles/css/diff2html.min.css'

  interface Props {
    diffText: string
    /** 高亮锚点：{ path, line } → 滚动到对应文件行 */
    anchor?: { path: string; line: number } | null
    sideBySide?: boolean
  }
  const props = withDefaults(defineProps<Props>(), { anchor: null, sideBySide: true })

  const containerRef = ref<HTMLElement>()

  const diffHtml = computed(() => {
    if (!props.diffText) return ''
    return html(props.diffText, {
      outputFormat: props.sideBySide ? 'side-by-side' : 'line-by-line',
      drawFileList: true,
      matching: 'lines',
      renderNothingWhenEmpty: false
    })
  })

  function scrollToAnchor(anchor: { path: string; line: number }): void {
    const el = containerRef.value
    if (!el) return
    const wrappers = Array.from(el.querySelectorAll<HTMLElement>('.d2h-file-wrapper'))
    const target = wrappers.find((w) => w.textContent?.includes(anchor.path))
    if (!target) return
    // diff2html 行号单元格（新版行号在 d2h-code-side-linenumber / d2h-code-linenumber）
    const cells = Array.from(
      target.querySelectorAll<HTMLElement>('.d2h-code-side-linenumber, .d2h-code-linenumber')
    )
    const cell = cells.find((c) => c.textContent?.trim() === String(anchor.line))
    if (cell) {
      cell.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const row = cell.closest('tr')
      if (row) {
        row.classList.add('diff-anchor-highlight')
        setTimeout(() => row.classList.remove('diff-anchor-highlight'), 3000)
      }
    }
  }

  watch(
    () => props.anchor,
    async (a) => {
      if (!a) return
      await nextTick()
      scrollToAnchor(a)
    }
  )
</script>

<style>
  /* diff2html 主题适配（非 scoped：diff2html 生成动态 DOM） */
  .diff-view {
    height: 100%;
    min-height: 0;
    overflow: auto;
  }

  .diff-view .d2h-file-wrapper {
    margin-bottom: 10px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
  }

  .diff-view .d2h-file-header {
    background: var(--el-fill-color-light);
  }

  /* 高亮锚点行 */
  .diff-view tr.diff-anchor-highlight td {
    background: var(--el-color-primary-light-8) !important;
    transition: background 0.5s;
  }

  /* 暗色适配 */
  html.dark .diff-view .d2h-file-wrapper,
  html.dark .diff-view .d2h-file-header,
  html.dark .diff-view .d2h-code-line,
  html.dark .diff-view .d2h-code-side-line {
    color: var(--el-text-color-regular);
    background: var(--el-bg-color);
  }
</style>
