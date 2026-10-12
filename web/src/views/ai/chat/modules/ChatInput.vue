<!-- 聊天输入框：自增高、Enter 发送 / Shift+Enter 换行、流式中变停止 -->
<template>
  <div
    class="flex items-end gap-2 rounded-2xl border border-g-300 bg-white px-3 py-2 transition-colors focus-within:border-[var(--main-color)] dark:bg-[#202123]"
  >
    <ElInput
      :model-value="modelValue"
      type="textarea"
      :autosize="{ minRows: 1, maxRows: 8 }"
      :placeholder="placeholder"
      :disabled="disabled"
      resize="none"
      class="chat-inputarea flex-1"
      @update:model-value="$emit('update:modelValue', $event)"
      @keydown.enter.exact.prevent="emit('send')"
      @keydown.escape="emit('stop')"
    />
    <ElButton
      v-if="streaming"
      circle
      type="danger"
      plain
      :disabled="disabled"
      title="停止生成（Esc）"
      @click="emit('stop')"
    >
      <ElIcon><VideoPause /></ElIcon>
    </ElButton>
    <ElButton
      v-else
      circle
      type="primary"
      :disabled="disabled || !modelValue.trim()"
      title="发送（Enter）"
      @click="emit('send')"
    >
      <ElIcon><Position /></ElIcon>
    </ElButton>
  </div>
</template>

<script setup lang="ts">
  import { Position, VideoPause } from '@element-plus/icons-vue'

  defineProps<{
    modelValue: string
    streaming?: boolean
    disabled?: boolean
    placeholder?: string
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: string]
    send: []
    stop: []
  }>()
</script>

<style scoped>
  .chat-inputarea :deep(textarea) {
    padding: 6px 0;
    background: transparent;
    box-shadow: none !important;
  }
</style>
