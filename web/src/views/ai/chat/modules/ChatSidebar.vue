<!-- 对话侧栏：新建、搜索、按时间分组的会话列表（参考 Open WebUI 侧栏） -->
<template>
  <aside class="flex h-full w-[264px] shrink-0 flex-col border-r border-g-200 bg-g-100">
    <div class="flex items-center gap-2 p-3">
      <ElButton type="primary" class="flex-1" @click="emit('create')" v-ripple>
        <ElIcon class="mr-1"><Plus /></ElIcon>新对话
      </ElButton>
    </div>

    <div class="px-3 pb-2">
      <ElInput
        ref="searchRef"
        v-model="keyword"
        placeholder="搜索对话（Ctrl+K）"
        clearable
        :prefix-icon="Search"
      />
    </div>

    <ElScrollbar class="min-h-0 flex-1 px-2">
      <div v-for="group in groups" :key="group.label" class="mb-2">
        <div class="px-2 py-1.5 text-xs text-g-400">{{ group.label }}</div>
        <div
          v-for="s in group.items"
          :key="s.id"
          class="group/item flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-2 text-sm transition-colors"
          :class="s.id === activeId ? 'bg-white shadow-sm ring-1 ring-g-200' : 'hover:bg-white/70'"
          @click="emit('select', s.id)"
        >
          <span class="min-w-0 flex-1 truncate" :title="s.title">{{ s.title }}</span>
          <span
            class="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100"
            @click.stop
          >
            <ElButton link size="small" title="重命名" @click="emit('rename', s)">
              <ElIcon><EditPen /></ElIcon>
            </ElButton>
            <ElButton link size="small" type="danger" title="删除" @click="emit('delete', s)">
              <ElIcon><Delete /></ElIcon>
            </ElButton>
          </span>
        </div>
      </div>

      <div v-if="!groups.length" class="px-3 py-10 text-center text-xs text-g-400">
        {{ keyword ? '没有匹配的对话' : '暂无历史对话' }}
      </div>
    </ElScrollbar>
  </aside>
</template>

<script setup lang="ts">
  import { Delete, EditPen, Plus, Search } from '@element-plus/icons-vue'
  import { groupSessions, type ChatSession } from './session-store'

  const props = defineProps<{
    sessions: ChatSession[]
    activeId: string
  }>()

  const emit = defineEmits<{
    create: []
    select: [id: string]
    rename: [session: ChatSession]
    delete: [session: ChatSession]
  }>()

  const keyword = ref('')
  const searchRef = ref()

  const groups = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    const list = kw
      ? props.sessions.filter(
          (s) =>
            s.title.toLowerCase().includes(kw) ||
            s.messages.some((m) => m.content.toLowerCase().includes(kw))
        )
      : props.sessions
    return groupSessions(list)
  })

  /** 供父组件快捷键调用（Ctrl+K 聚焦搜索） */
  const focusSearch = () => {
    searchRef.value?.focus?.()
  }

  defineExpose({ focusSearch })
</script>
