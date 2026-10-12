<!-- 单条消息：用户右侧气泡 / AI 左侧 Markdown 渲染，悬浮操作条 -->
<template>
  <div class="group mb-6 flex" :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
    <!-- 用户 -->
    <div v-if="message.role === 'user'" class="max-w-[85%]">
      <div
        class="whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--main-color)] px-4 py-2.5 text-sm leading-6 text-white"
        >{{ message.content }}</div
      >
      <div class="mt-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <ElButton link size="small" @click="emit('edit', message.id)" title="编辑并重新发送">
          <ElIcon><EditPen /></ElIcon>
        </ElButton>
        <ElButton link size="small" @click="copyContent" title="复制">
          <ElIcon><CopyDocument /></ElIcon>
        </ElButton>
      </div>
    </div>

    <!-- AI -->
    <div v-else class="flex max-w-[92%] gap-3">
      <div
        class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--main-color)]/10"
      >
        <ArtSvgIcon icon="ri:bot-2-fill" class="text-[18px] text-[var(--main-color)]" />
      </div>
      <div class="min-w-0 flex-1">
        <!-- Agent 工具调用轨迹 -->
        <div v-if="message.tools?.length" class="mb-1.5 flex flex-wrap gap-1.5">
          <span
            v-for="(t, i) in message.tools"
            :key="i"
            class="inline-flex items-center gap-1 rounded-full bg-g-100 px-2 py-0.5 text-xs text-g-600"
          >
            <span>{{ aiToolLabel(t.name) }}</span>
            <span v-if="t.status === 'running'" class="animate-pulse text-theme">···</span>
            <ArtSvgIcon v-else-if="t.status === 'done'" icon="ri:check-line" class="text-success" />
            <ArtSvgIcon v-else icon="ri:close-line" class="text-danger" />
          </span>
        </div>
        <AiMarkdown v-if="message.content" :content="message.content" />
        <span v-if="streaming" class="ml-0.5 inline-block animate-pulse text-[var(--main-color)]"
          >▌</span
        >
        <div v-else-if="message.usage || message.model" class="mt-1.5 flex flex-wrap gap-2">
          <span v-if="message.model" class="rounded bg-g-100 px-1.5 py-0.5 text-xs text-g-500">
            {{ message.model }}
          </span>
          <span v-if="message.usage" class="text-xs text-g-400">
            {{ message.usage.totalTokens }} tokens
          </span>
        </div>
        <div
          v-if="message.content && !streaming"
          class="mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <ElButton link size="small" @click="copyContent" title="复制">
            <ElIcon><CopyDocument /></ElIcon>
          </ElButton>
          <ElButton link size="small" @click="emit('regenerate', message.id)" title="重新生成">
            <ElIcon><RefreshRight /></ElIcon>
          </ElButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import AiMarkdown from '@/components/business/ai-markdown/index.vue'
  import { CopyDocument, EditPen, RefreshRight } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import { aiToolLabel } from '@/utils/ai-tools'
  import type { ChatMessageItem } from './session-store'

  const props = defineProps<{
    message: ChatMessageItem
    /** 是否是正在流式输出的消息 */
    streaming?: boolean
  }>()

  const emit = defineEmits<{
    regenerate: [messageId: string]
    edit: [messageId: string]
  }>()

  const copyContent = async () => {
    await navigator.clipboard.writeText(props.message.content)
    ElMessage.success('已复制')
  }
</script>
