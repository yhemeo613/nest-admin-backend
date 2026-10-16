<template>
  <!-- 发现卡片：severity 色条 + category + 位置锚点 + 内容 + 思维链 + 修复建议 + 状态操作 -->
  <div
    class="finding-card"
    :class="[`sev-${finding.severity}`, { resolved: finding.status !== 'OPEN' }]"
  >
    <div class="sev-bar" />
    <div class="finding-body">
      <div class="finding-head">
        <ElTag :type="severityType" size="small" effect="dark">{{
          finding.severity.toUpperCase()
        }}</ElTag>
        <ElTag size="small" effect="plain">{{ categoryLabel }}</ElTag>
        <el-tooltip :content="'跳转到 diff'" placement="top">
          <button class="loc-link" type="button" @click="$emit('locate', finding)">
            {{ finding.path }}:{{ finding.startLine }}
          </button>
        </el-tooltip>
        <ElTag v-if="finding.isNew" type="warning" size="small" effect="plain" class="ml-auto"
          >新增</ElTag
        >
        <ElTag v-else size="small" effect="plain" type="info" class="ml-auto">遗留</ElTag>
      </div>

      <div class="finding-content" v-highlight v-html="contentHtml" />

      <ThinkingBlock v-if="finding.thinking" :content="finding.thinking" class="mt-2" />
      <SuggestionBlock
        :existing-code="finding.existingCode"
        :suggestion-code="finding.suggestionCode"
      />

      <div class="finding-actions" v-if="!readonly">
        <template v-if="finding.status === 'OPEN'">
          <ElButton
            size="small"
            type="success"
            plain
            @click="$emit('update-status', finding, 'FIXED')"
            v-auth="PermissionCode.ReviewFindingUpdate"
          >
            标记已修复
          </ElButton>
          <ElButton
            size="small"
            plain
            @click="$emit('update-status', finding, 'IGNORED')"
            v-auth="PermissionCode.ReviewFindingUpdate"
          >
            忽略
          </ElButton>
        </template>
        <template v-else>
          <ElTag
            :type="finding.status === 'FIXED' ? 'success' : 'info'"
            size="small"
            effect="plain"
          >
            {{ statusLabel }}
          </ElTag>
          <ElButton
            size="small"
            link
            type="primary"
            @click="$emit('update-status', finding, 'OPEN')"
            v-auth="PermissionCode.ReviewFindingUpdate"
          >
            重新打开
          </ElButton>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { PermissionCode } from '@nestperm/contracts'
  import { renderMarkdown } from '@/utils/markdown'
  import ThinkingBlock from './thinking-block.vue'
  import SuggestionBlock from './suggestion-block.vue'

  interface Props {
    finding: Api.Review.FindingItem
    readonly?: boolean
  }
  const props = withDefaults(defineProps<Props>(), { readonly: false })
  defineEmits<{
    (e: 'update-status', finding: Api.Review.FindingItem, status: Api.Review.FindingStatus): void
    (e: 'locate', finding: Api.Review.FindingItem): void
  }>()

  const contentHtml = computed(() => renderMarkdown(props.finding.content))

  const severityType = computed(() => {
    const map: Record<string, 'danger' | 'warning' | 'primary' | 'info'> = {
      critical: 'danger',
      high: 'warning',
      medium: 'primary',
      low: 'info'
    }
    return map[props.finding.severity] ?? 'info'
  })

  const categoryLabel = computed(() => {
    const map: Record<string, string> = {
      bug: '缺陷',
      security: '安全',
      performance: '性能',
      maintainability: '可维护性',
      test: '测试',
      style: '风格',
      documentation: '文档',
      other: '其他'
    }
    return map[props.finding.category] ?? props.finding.category
  })

  const statusLabel = computed(() => {
    const map: Record<string, string> = { FIXED: '已修复', IGNORED: '已忽略', RESOLVED: '已解决' }
    return map[props.finding.status] ?? props.finding.status
  })
</script>

<style scoped lang="scss">
  .finding-card {
    display: flex;
    overflow: hidden;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    transition: box-shadow 0.15s;

    &:hover {
      box-shadow: var(--el-box-shadow-light);
    }

    .sev-bar {
      flex-shrink: 0;
      width: 4px;
    }

    &.sev-critical .sev-bar {
      background: var(--el-color-danger);
    }

    &.sev-high .sev-bar {
      background: var(--el-color-warning);
    }

    &.sev-medium .sev-bar {
      background: var(--el-color-primary);
    }

    &.sev-low .sev-bar {
      background: var(--el-color-info);
    }

    &.resolved {
      opacity: 0.72;
    }

    .finding-body {
      flex: 1;
      min-width: 0;
      padding: 12px 14px;
    }

    .finding-head {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;

      .loc-link {
        padding: 0;
        font-family: var(--el-font-family);
        font-family: monospace;
        font-size: 12px;
        color: var(--el-color-primary);
        cursor: pointer;
        background: none;
        border: none;

        &:hover {
          text-decoration: underline;
        }
      }

      .ml-auto {
        margin-left: auto;
      }
    }

    .finding-content {
      margin-top: 8px;
      font-size: 13px;
      line-height: 1.7;
      color: var(--el-text-color-primary);

      :deep(p) {
        margin: 0 0 6px;
      }

      :deep(pre) {
        font-size: 12px;
        background: var(--el-fill-color-dark);
        border-radius: 4px;
      }
    }

    .finding-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 10px;
    }
  }
</style>
