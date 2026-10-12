<!-- AI 用量报表：真实数据 + ECharts（KPI / 趋势 / 分布 / 明细） -->
<template>
  <div class="art-full-height">
    <!-- KPI 概览 -->
    <ElRow :gutter="20">
      <ElCol v-for="card in kpiCards" :key="card.label" :sm="12" :md="6">
        <div class="art-card relative mb-5 flex h-35 flex-col justify-center px-5 max-sm:mb-4">
          <span class="text-sm text-g-700">{{ card.label }}</span>
          <ArtCountTo class="mt-2 text-[26px] font-medium" :target="card.value" :duration="1200" />
          <span class="mt-1 truncate text-xs text-g-600" :title="card.sub">{{ card.sub }}</span>
          <div
            class="absolute top-0 bottom-0 right-5 m-auto size-12.5 rounded-xl bg-theme/10 flex-cc"
          >
            <ArtSvgIcon :icon="card.icon" class="text-xl text-theme" />
          </div>
        </div>
      </ElCol>
    </ElRow>

    <!-- 趋势 + Token 占比 -->
    <ElRow :gutter="20">
      <ElCol :sm="24" :lg="16">
        <div class="art-card mb-5 p-5" v-loading="trendLoading">
          <div class="flex-cb mb-4">
            <h3 class="text-base font-medium">近 14 天调用趋势</h3>
            <span class="text-xs text-g-400">双柱对比：调用次数 / Tokens（千）</span>
          </div>
          <ArtBarChart
            :data="trendBarData"
            :x-axis-data="trendXAxis"
            :height="'260px'"
            :is-empty="trendEmpty"
            :show-legend="true"
          />
        </div>
      </ElCol>
      <ElCol :sm="24" :lg="8">
        <div class="art-card mb-5 p-5" v-loading="loading">
          <div class="flex-cb mb-4">
            <h3 class="text-base font-medium">Token 消耗占比</h3>
            <span class="text-xs text-g-400">按模型</span>
          </div>
          <ArtRingChart
            :data="tokenShareData"
            :center-text="`${formatCompact(totals.totalTokens)}`"
            :height="'260px'"
            :is-empty="!tokenShareData.length"
            :show-legend="true"
            :show-label="true"
          />
        </div>
      </ElCol>
    </ElRow>

    <!-- 模型 / 厂商调用次数 -->
    <ElRow :gutter="20">
      <ElCol :sm="24" :md="12">
        <div class="art-card mb-5 p-5" v-loading="loading">
          <h3 class="mb-4 text-base font-medium">各模型调用次数</h3>
          <ArtBarChart
            :data="modelCallsData"
            :x-axis-data="modelCallsLabels"
            :height="'240px'"
            :is-empty="!summary.length"
          />
        </div>
      </ElCol>
      <ElCol :sm="24" :md="12">
        <div class="art-card mb-5 p-5" v-loading="loading">
          <h3 class="mb-4 text-base font-medium">各厂商调用次数</h3>
          <ArtBarChart
            :data="providerCallsData"
            :x-axis-data="providerCallsLabels"
            :height="'240px'"
            :is-empty="!summary.length"
          />
        </div>
      </ElCol>
    </ElRow>

    <!-- 明细表 -->
    <ElCard class="art-table-card" shadow="never">
      <div class="flex-cb mb-3">
        <div class="text-base font-medium">调用明细（按厂商 / 模型）</div>
        <ElButton circle @click="loadAll" v-ripple>
          <ElIcon><Refresh /></ElIcon>
        </ElButton>
      </div>

      <ElTable :data="summary" v-loading="loading" stripe>
        <ElTableColumn prop="provider" label="厂商" width="120" />
        <ElTableColumn prop="model" label="模型" min-width="200">
          <template #default="{ row }">{{ row.model || '-' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="calls" label="调用次数" width="110" />
        <ElTableColumn prop="promptTokens" label="输入 Tokens" width="130" />
        <ElTableColumn prop="completionTokens" label="输出 Tokens" width="130" />
        <ElTableColumn prop="totalTokens" label="总 Tokens" width="120" />
        <ElTableColumn prop="costEstimate" label="估算成本（元）" min-width="150">
          <template #default="{ row }">
            <span v-if="row.costEstimate != null">¥{{ row.costEstimate }}</span>
            <span v-else class="text-g-500">未配置单价</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="平均单次成本" min-width="130">
          <template #default="{ row }">
            <span v-if="row.costEstimate != null && row.calls">
              ¥{{ (row.costEstimate / row.calls).toFixed(6) }}
            </span>
            <span v-else class="text-g-500">-</span>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { fetchAiTrend } from '@/api/dashboard'
  import { fetchGetAiUsage } from '@/api/system-manage'
  import { Refresh } from '@element-plus/icons-vue'

  defineOptions({ name: 'AiUsage' })

  type UsageItem = Api.SystemManage.AiUsageItem

  const loading = ref(false)
  const trendLoading = ref(false)
  const summary = ref<UsageItem[]>([])
  const trend = ref<Api.Dashboard.TrendPoint[]>([])

  // ---------- 汇总派生 ----------
  const totals = computed(() => {
    const acc = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
    for (const row of summary.value) {
      acc.calls += row.calls
      acc.promptTokens += row.promptTokens
      acc.completionTokens += row.completionTokens
      acc.totalTokens += row.totalTokens
      acc.cost += row.costEstimate ?? 0
    }
    return acc
  })

  const providerCount = computed(() => new Set(summary.value.map((r) => r.provider)).size)
  const modelCount = computed(() => summary.value.length)

  const kpiCards = computed(() => [
    {
      label: '累计调用',
      icon: 'ri:robot-line',
      value: totals.value.calls,
      sub: `${providerCount.value} 个厂商 · ${modelCount.value} 个模型`
    },
    {
      label: '累计 Tokens',
      icon: 'ri:token-line',
      value: totals.value.totalTokens,
      sub: `输入 ${formatCompact(totals.value.promptTokens)} · 输出 ${formatCompact(totals.value.completionTokens)}`
    },
    {
      label: '累计成本（元）',
      icon: 'ri:money-cny-circle-line',
      value: Math.round(totals.value.cost * 10000) / 10000,
      sub: '按厂商公开单价估算'
    },
    {
      label: '平均单次成本（元）',
      icon: 'ri:price-tag-3-line',
      value: totals.value.calls
        ? Math.round((totals.value.cost / totals.value.calls) * 100000) / 100000
        : 0,
      sub: '估算成本 / 调用次数'
    }
  ])

  const formatCompact = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(2)}M`
      : n >= 1000
        ? `${(n / 1000).toFixed(1)}k`
        : String(n)

  // ---------- 趋势（柱=调用次数，线=Tokens 千） ----------
  const trendXAxis = computed(() => trend.value.map((p) => p.date.slice(5)))
  const trendBarData = computed(() => [
    { name: '调用次数', data: trend.value.map((p) => p.calls) },
    {
      name: 'Tokens（千）',
      data: trend.value.map((p) => Math.round(p.tokens / 100) / 10)
    }
  ])
  const trendEmpty = computed(() => trend.value.every((p) => p.calls === 0))

  // ---------- Token 占比环图（Top8 + 其他） ----------
  const tokenShareData = computed(() => {
    const sorted = [...summary.value].sort((a, b) => b.totalTokens - a.totalTokens)
    const top = sorted
      .slice(0, 8)
      .map((r) => ({ name: r.model || r.provider, value: r.totalTokens }))
    const rest = sorted.slice(8).reduce((sum, r) => sum + r.totalTokens, 0)
    if (rest > 0) top.push({ name: '其他', value: rest })
    return top.filter((d) => d.value > 0)
  })

  // ---------- 模型 / 厂商调用柱状 ----------
  const modelCallsLabels = computed(() =>
    [...summary.value]
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 8)
      .map((r) => r.model || '-')
  )
  const modelCallsData = computed(() => {
    const sorted = [...summary.value].sort((a, b) => b.calls - a.calls).slice(0, 8)
    return sorted.map((r) => r.calls)
  })

  const providerCalls = computed(() => {
    const map = new Map<string, number>()
    for (const row of summary.value) {
      map.set(row.provider, (map.get(row.provider) ?? 0) + row.calls)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  })
  const providerCallsLabels = computed(() => providerCalls.value.map(([name]) => name))
  const providerCallsData = computed(() => providerCalls.value.map(([, calls]) => calls))

  // ---------- 加载 ----------
  const loadAll = async () => {
    loading.value = true
    trendLoading.value = true
    try {
      const [usage, trendData] = await Promise.all([
        fetchGetAiUsage(),
        fetchAiTrend(14).catch(() => [] as Api.Dashboard.TrendPoint[])
      ])
      summary.value = usage
      trend.value = trendData
    } finally {
      loading.value = false
      trendLoading.value = false
    }
  }

  onMounted(loadAll)
</script>
