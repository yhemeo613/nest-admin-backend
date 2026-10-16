<template>
  <!-- 修复建议对比块：existing vs suggestion 两行并排 -->
  <div v-if="existingCode || suggestionCode" class="suggestion-block">
    <div class="suggestion-header">修复建议</div>
    <div class="suggestion-grid">
      <div v-if="existingCode" class="code-side">
        <div class="side-label old">现状</div>
        <pre v-highlight><code>{{ existingCode }}</code></pre>
      </div>
      <div v-if="suggestionCode" class="code-side">
        <div class="side-label new">建议</div>
        <pre v-highlight><code>{{ suggestionCode }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  interface Props {
    existingCode?: string | null
    suggestionCode?: string | null
  }
  defineProps<Props>()
</script>

<style scoped lang="scss">
  .suggestion-block {
    margin-top: 8px;
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;

    .suggestion-header {
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-light);
    }

    .suggestion-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;

      &:has(.code-side:only-child) {
        grid-template-columns: 1fr;
      }

      .code-side {
        min-width: 0;

        & + .code-side {
          border-left: 1px solid var(--el-border-color-lighter);
        }

        .side-label {
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 600;

          &.old {
            color: var(--el-color-danger);
            background: var(--el-color-danger-light-9);
          }

          &.new {
            color: var(--el-color-success);
            background: var(--el-color-success-light-9);
          }
        }

        pre {
          padding: 8px 10px;
          margin: 0;
          overflow-x: auto;
          font-size: 12px;
        }
      }
    }
  }
</style>
