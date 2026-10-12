<!-- 工作台：全部由真实后端接口驱动（/dashboard/*），无任何 mock 内容 -->
<template>
  <div>
    <!-- 欢迎横幅 -->
    <div class="art-card flex-cb mb-5 p-5 max-sm:mb-4">
      <div>
        <h2 class="text-xl font-medium text-g-900">{{ greeting }}，{{ nickname }}</h2>
        <p class="mt-1.5 text-sm text-g-600">{{ dateText }} · 数据实时来自后端接口</p>
      </div>
      <div class="flex items-center gap-2 max-md:hidden">
        <span
          v-if="stats?.ai.defaultModel"
          class="rounded-full bg-theme/10 px-3 py-1.5 text-xs text-theme"
        >
          默认模型：{{ stats.ai.defaultModel }}
        </span>
        <span class="rounded-full bg-g-100 px-3 py-1.5 text-xs text-g-600">
          今日调用 {{ stats?.ai.callsToday ?? 0 }} 次
        </span>
      </div>
    </div>

    <!-- 核心指标 -->
    <ElRow :gutter="20">
      <ElCol v-for="card in kpiCards" :key="card.label" :sm="12" :md="6">
        <div class="art-card relative mb-5 flex h-35 flex-col justify-center px-5 max-sm:mb-4">
          <span class="text-sm text-g-700">{{ card.label }}</span>
          <ArtCountTo class="mt-2 text-[26px] font-medium" :target="card.value" :duration="1300" />
          <span class="mt-1 truncate text-xs text-g-600" :title="card.sub">{{ card.sub }}</span>
          <div
            class="absolute top-0 bottom-0 right-5 m-auto size-12.5 rounded-xl bg-theme/10 flex-cc"
          >
            <ArtSvgIcon :icon="card.icon" class="text-xl text-theme" />
          </div>
        </div>
      </ElCol>
    </ElRow>

    <!-- 趋势 + 最近调用 -->
    <ElRow :gutter="20">
      <ElCol :sm="24" :lg="16">
        <AiTrend />
      </ElCol>
      <ElCol :sm="24" :lg="8">
        <RecentCalls />
      </ElCol>
    </ElRow>

    <!-- 资源概览 + 快捷入口 -->
    <SystemOverview :stats="stats" />
  </div>
</template>

<script setup lang="ts">
  import { fetchDashboardStats } from '@/api/dashboard'
  import { useUserStore } from '@/store/modules/user'
  import AiTrend from './modules/ai-trend.vue'
  import RecentCalls from './modules/recent-calls.vue'
  import SystemOverview from './modules/system-overview.vue'

  defineOptions({ name: 'Console' })

  const userStore = useUserStore()

  const stats = ref<Api.Dashboard.Stats | null>(null)

  const nickname = computed(() => userStore.info?.nickName || userStore.info?.userName || '管理员')

  const greeting = computed(() => {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了'
    if (hour < 12) return '早上好'
    if (hour < 18) return '下午好'
    return '晚上好'
  })

  const dateText = computed(() =>
    new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
  )

  /** KPI：真实统计派生，stats 未就绪时展示 0/- */
  const kpiCards = computed(() => {
    const s = stats.value
    return [
      {
        label: '用户总数',
        icon: 'ri:group-line',
        value: s?.system.users ?? 0,
        sub: s ? `角色 ${s.system.roles} · 部门 ${s.system.departments}` : '加载中…'
      },
      {
        label: '权限点',
        icon: 'ri:shield-keyhole-line',
        value: s?.system.permissions ?? 0,
        sub: s ? `供应商 ${s.ai.providers} · 模型 ${s.ai.models}` : '加载中…'
      },
      {
        label: '今日 AI 调用',
        icon: 'ri:robot-line',
        value: s?.ai.callsToday ?? 0,
        sub: s
          ? `${s.ai.errorsToday > 0 ? `失败 ${s.ai.errorsToday} · ` : ''}平均 ${s.ai.avgLatencyToday ?? 0}ms`
          : '加载中…'
      },
      {
        label: '今日 Tokens',
        icon: 'ri:coins-line',
        value: s?.ai.tokensToday ?? 0,
        sub: s ? `成本 ¥${s.ai.costToday.toFixed(4)} · 累计 ${s.ai.callsTotal} 次` : '加载中…'
      }
    ]
  })

  const loadData = async () => {
    try {
      stats.value = await fetchDashboardStats()
    } catch {
      /* 无权限/接口异常时卡片保持 0，不阻塞页面 */
    }
  }

  onMounted(loadData)
</script>
