<template>
  <!-- AI 思维链折叠块：灰底斜体感、默认收起 -->
  <div class="thinking-block" :class="{ expanded }">
    <button class="thinking-toggle" type="button" @click="expanded = !expanded">
      <ElIcon class="toggle-icon"><ArrowRight /></ElIcon>
      <span class="toggle-label">{{ label }}</span>
      <span class="toggle-hint">{{ expanded ? '收起' : '展开 AI 思考过程' }}</span>
    </button>
    <div v-show="expanded" class="thinking-content" v-highlight v-html="html"></div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ArrowRight } from '@element-plus/icons-vue'
  import { renderMarkdown } from '@/utils/markdown'

  interface Props {
    content: string
    label?: string
  }
  const props = withDefaults(defineProps<Props>(), { label: '思考过程' })

  const expanded = ref(false)
  const html = computed(() => renderMarkdown(props.content))
</script>

<style scoped lang="scss">
  .thinking-block {
    overflow: hidden;
    background: var(--el-fill-color-light);
    border-left: 3px solid var(--el-color-warning-light-5);
    border-radius: 4px;

    .thinking-toggle {
      display: flex;
      gap: 6px;
      align-items: center;
      width: 100%;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      text-align: left;
      cursor: pointer;
      background: transparent;
      border: none;

      .toggle-icon {
        transition: transform 0.2s;
      }

      .toggle-hint {
        margin-left: auto;
        opacity: 0.6;
      }

      &:hover {
        color: var(--el-text-color-primary);
      }
    }

    &.expanded .toggle-icon {
      transform: rotate(90deg);
    }

    .thinking-content {
      padding: 4px 12px 10px;
      font-size: 12.5px;
      font-style: italic;
      line-height: 1.7;
      color: var(--el-text-color-regular);

      :deep(pre) {
        font-style: normal;
        background: var(--el-fill-color-dark);
        border-radius: 4px;
      }
    }
  }
</style>
