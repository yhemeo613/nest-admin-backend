<!-- 最近 AI 调用记录（真实 ai_call_log 数据） -->
<template>
  <div class="art-card h-full p-5 mb-5 max-sm:mb-4" v-loading="loading">
    <div class="flex-cb mb-3">
      <h3 class="text-base font-medium">最近 AI 调用</h3>
      <ElButton link size="small" @click="loadData" title="刷新">
        <ElIcon><Refresh /></ElIcon>
      </ElButton>
    </div>

    <div v-if="list.length" class="flex flex-col gap-1">
      <div
        v-for="item in list"
        :key="item.id"
        class="flex-cb rounded-lg px-2 py-2 transition-colors hover:bg-hover-color"
        :title="item.errorMsg ?? undefined"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="size-2 shrink-0 rounded-full" :class="statusClass(item.status)" />
          <span class="truncate text-sm text-g-800">{{ item.model }}</span>
          <span class="shrink-0 text-xs text-g-400">{{ item.provider }}</span>
        </div>
        <div class="flex shrink-0 items-center gap-3 text-xs text-g-500">
          <span>{{ item.latencyMs }}ms</span>
          <span>{{ item.totalTokens }} tk</span>
          <span>{{ formatTime(item.createdAt) }}</span>
        </div>
      </div>
    </div>
    <div v-else class="py-10 text-center text-xs text-g-400">暂无调用记录</div>
  </div>
</template>

<script setup lang="ts">
  import { fetchRecentAiCalls } from '@/api/dashboard'
  import { Refresh } from '@element-plus/icons-vue'

  const loading = ref(false)
  const list = ref<Api.Dashboard.RecentCall[]>([])

  const statusClass = (status: string) =>
    status === 'success' ? 'bg-success' : status === 'fallback' ? 'bg-warning' : 'bg-danger'

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const loadData = async () => {
    loading.value = true
    try {
      list.value = await fetchRecentAiCalls(8)
    } finally {
      loading.value = false
    }
  }

  onMounted(loadData)
</script>
