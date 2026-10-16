<template>
  <!-- 执行轨迹时间线：LLM 调用列表，点击展开完整记录（消息流 + thinking + 工具调用） -->
  <div class="trace-timeline">
    <ElEmpty v-if="!calls.length" description="暂无执行轨迹" />
    <div
      v-for="call in calls"
      :key="call.seq"
      class="trace-item"
      :class="{ expanded: expandedSeq === call.seq }"
    >
      <button class="trace-row" type="button" @click="toggle(call.seq)">
        <span class="seq">#{{ call.seq }}</span>
        <ElTag v-if="call.taskType" size="small" effect="plain" :type="taskTypeTag(call.taskType)">
          {{ call.taskType }}
        </ElTag>
        <span v-if="call.filePath" class="file-path">{{ call.filePath }}</span>
        <span v-if="call.model" class="model">{{ call.model }}</span>
        <span class="meta">
          <span v-if="call.tokensIn != null">{{ call.tokensIn + (call.tokensOut ?? 0) }} tok</span>
          <span>{{ formatDuration(call.durationMs) }}</span>
          <ElTag
            v-if="call.statusCode && call.statusCode >= 400"
            type="danger"
            size="small"
            effect="plain"
            >HTTP {{ call.statusCode }}</ElTag
          >
        </span>
        <ElIcon class="chevron"><ArrowRight /></ElIcon>
      </button>

      <div v-show="expandedSeq === call.seq" class="trace-detail" v-loading="detailLoading">
        <template v-if="detail">
          <div v-if="messages.length" class="msg-list">
            <div v-for="(m, i) in messages" :key="i" class="msg" :class="`role-${m.role}`">
              <div class="msg-role">{{ roleLabel(m.role) }}</div>
              <div class="msg-body" v-highlight v-html="renderMsg(m.content)" />
            </div>
          </div>
          <ThinkingBlock v-if="thinking" :content="thinking" label="AI 思维链" class="mt-2" />
          <div v-if="toolCalls.length" class="tool-calls">
            <div class="tool-calls-title">工具调用</div>
            <div v-for="(t, i) in toolCalls" :key="i" class="tool-call">
              <code>{{ t.name }}</code>
              <pre v-if="t.input">{{ t.input }}</pre>
            </div>
          </div>
          <div class="trace-meta">
            <span>request_id: {{ detail.request_id }}</span>
            <span v-if="detail.trace_id">trace: {{ detail.trace_id }}</span>
            <span>{{ detail.timestamp }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ArrowRight } from '@element-plus/icons-vue'
  import { reviewApi } from '@/api/review'
  import { renderMarkdown } from '@/utils/markdown'
  import ThinkingBlock from './thinking-block.vue'

  interface Props {
    taskId: string
    calls: Api.Review.TraceCallItem[]
  }
  const props = defineProps<Props>()

  const expandedSeq = ref<number | null>(null)
  const detail = ref<Record<string, any> | null>(null)
  const detailLoading = ref(false)

  interface ChatMessage {
    role: string
    content: string
  }

  const messages = computed<ChatMessage[]>(() => {
    const body = detail.value?.request_body as Record<string, unknown> | undefined
    const msgs = (body?.messages ?? body?.input) as unknown
    if (!Array.isArray(msgs)) return []
    return msgs
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .map((m) => ({
        role: String(m.role ?? 'user'),
        content: flattenContent(m.content)
      }))
  })

  const thinking = computed(() => {
    const body = detail.value?.response_body as Record<string, unknown> | undefined
    if (!body) return ''
    // OpenAI reasoning_content / Anthropic thinking blocks
    const choice = (body.choices as Array<Record<string, unknown>> | undefined)?.[0]
    const msg = choice?.message as Record<string, unknown> | undefined
    if (msg?.reasoning_content) return String(msg.reasoning_content)
    const content = body.content
    if (Array.isArray(content)) {
      const t = content.find(
        (b): b is Record<string, unknown> =>
          typeof b === 'object' && b !== null && b.type === 'thinking'
      )
      if (t?.thinking) return String(t.thinking)
    }
    return ''
  })

  const toolCalls = computed(() => {
    const body = detail.value?.response_body as Record<string, unknown> | undefined
    if (!body) return []
    const choice = (body.choices as Array<Record<string, unknown>> | undefined)?.[0]
    const msg = choice?.message as Record<string, unknown> | undefined
    const calls = msg?.tool_calls as Array<Record<string, unknown>> | undefined
    if (!calls) return []
    return calls.map((c) => {
      const fn = c.function as Record<string, unknown> | undefined
      return {
        name: String(fn?.name ?? 'unknown'),
        input: fn?.arguments ? String(fn.arguments) : ''
      }
    })
  })

  function flattenContent(content: unknown): string {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((c) => {
          if (typeof c === 'string') return c
          if (typeof c === 'object' && c !== null) {
            const o = c as Record<string, unknown>
            return String(o.text ?? o.content ?? '')
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')
    }
    return ''
  }

  function renderMsg(content: string): string {
    return renderMarkdown(content)
  }

  function roleLabel(role: string): string {
    const map: Record<string, string> = {
      system: '系统',
      user: '用户/任务',
      assistant: 'AI',
      tool: '工具结果'
    }
    return map[role] ?? role
  }

  function taskTypeTag(taskType: string): 'primary' | 'warning' | 'success' | 'info' {
    if (taskType.includes('MAIN')) return 'primary'
    if (taskType.includes('PLAN')) return 'warning'
    if (taskType.includes('FILTER') || taskType.includes('RE_LOCATION')) return 'info'
    return 'success'
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  async function toggle(seq: number): Promise<void> {
    if (expandedSeq.value === seq) {
      expandedSeq.value = null
      return
    }
    expandedSeq.value = seq
    detailLoading.value = true
    detail.value = null
    try {
      detail.value = await reviewApi.fetchTraceCall(props.taskId, seq)
    } finally {
      detailLoading.value = false
    }
  }
</script>

<style scoped lang="scss">
  .trace-timeline {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .trace-item {
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;

    &.expanded {
      border-color: var(--el-color-primary-light-5);
    }
  }

  .trace-row {
    display: flex;
    gap: 8px;
    align-items: center;
    width: 100%;
    padding: 8px 12px;
    font-size: 12.5px;
    color: var(--el-text-color-regular);
    text-align: left;
    cursor: pointer;
    background: none;
    border: none;

    &:hover {
      background: var(--el-fill-color-light);
    }

    .seq {
      min-width: 28px;
      font-family: monospace;
      color: var(--el-text-color-secondary);
    }

    .file-path {
      max-width: 320px;
      overflow: hidden;
      font-family: monospace;
      font-size: 12px;
      color: var(--el-color-primary);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .model {
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    .meta {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-left: auto;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    .chevron {
      flex-shrink: 0;
      transition: transform 0.2s;
    }

    .expanded & .chevron,
    .trace-item.expanded & .chevron {
      transform: rotate(90deg);
    }
  }

  .trace-detail {
    padding: 12px;
    background: var(--el-fill-color-extra-light);
    border-top: 1px solid var(--el-border-color-lighter);

    .msg-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 480px;
      overflow-y: auto;
    }

    .msg {
      padding: 8px 10px;
      font-size: 12.5px;
      border-radius: 6px;

      .msg-role {
        margin-bottom: 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--el-text-color-secondary);
      }

      &.role-system {
        background: var(--el-color-info-light-9);
      }

      &.role-user {
        background: var(--el-color-primary-light-9);
      }

      &.role-assistant {
        background: var(--el-color-success-light-9);
      }

      &.role-tool {
        background: var(--el-color-warning-light-9);
      }
    }

    .tool-calls {
      margin-top: 8px;

      .tool-calls-title {
        margin-bottom: 4px;
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-secondary);
      }

      .tool-call {
        padding: 6px 10px;
        margin-top: 4px;
        font-size: 12px;
        background: var(--el-fill-color);
        border-radius: 4px;

        pre {
          margin: 4px 0 0;
          font-size: 11px;
          word-break: break-all;
          white-space: pre-wrap;
        }
      }
    }

    .trace-meta {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      font-family: monospace;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }
  }
</style>
