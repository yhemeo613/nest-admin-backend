<!-- AI 调用趋势：近 14 天真实数据，可切换调用次数 / Tokens -->
<template>
  <div class="art-card h-full p-5 mb-5 max-sm:mb-4" v-loading="loading">
    <div class="flex-cb mb-4">
      <h3 class="text-base font-medium">AI 调用趋势</h3>
      <ElSegmented v-model="metric" :options="metricOptions" size="small" />
    </div>

    <ArtLineChart
      :data="chartData"
      :x-axis-data="xAxisData"
      :height="'260px'"
      :is-empty="isEmpty"
      :show-area-color="true"
    />
    <div v-if="isEmpty" class="mt-2 text-center text-xs text-g-400">
      近 14 天暂无 AI 调用记录，去
      <span class="c-p text-theme" @click="goChat">AI 问答</span>
      发起第一次对话吧
    </div>
  </div>
</template>

<script setup lang="ts">
  import { fetchAiTrend } from '@/api/dashboard'

  const router = useRouter()

  const loading = ref(false)
  const trend = ref<Api.Dashboard.TrendPoint[]>([])
  const metric = ref<'calls' | 'tokens'>('calls')

  const metricOptions = [
    { label: '调用次数', value: 'calls' },
    { label: 'Tokens', value: 'tokens' }
  ]

  const xAxisData = computed(() => trend.value.map((p) => p.date.slice(5)))
  const chartData = computed(() =>
    trend.value.map((p) => (metric.value === 'calls' ? p.calls : p.tokens))
  )
  const isEmpty = computed(() => trend.value.every((p) => p.calls === 0))

  const goChat = () => router.push('/ai/chat')

  const loadData = async () => {
    loading.value = true
    try {
      trend.value = await fetchAiTrend(14)
    } finally {
      loading.value = false
    }
  }

  onMounted(loadData)
</script>
