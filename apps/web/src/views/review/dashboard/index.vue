<template>
  <div class="art-full-height review-dashboard">
    <!-- 统计卡 -->
    <div class="stats-row">
      <ElCard v-for="card in statCards" :key="card.label" shadow="never" class="stat-card">
        <div class="stat-content">
          <div class="stat-icon" :style="{ background: card.bg }">
            <ElIcon :size="22" :color="card.color"><component :is="card.icon" /></ElIcon>
          </div>
          <div>
            <div class="stat-value">{{ card.value }}</div>
            <div class="stat-label">{{ card.label }}</div>
          </div>
        </div>
      </ElCard>
    </div>

    <!-- 图表行 -->
    <div class="charts-row">
      <ElCard shadow="never" class="chart-card">
        <div class="chart-title">近 30 天问题趋势（severity）</div>
        <div ref="trendRef" class="chart-box" />
      </ElCard>
      <ElCard shadow="never" class="chart-card">
        <div class="chart-title">问题类型分布</div>
        <div ref="categoryRef" class="chart-box" />
      </ElCard>
      <ElCard shadow="never" class="chart-card">
        <div class="chart-title">每日 Token 消耗</div>
        <div ref="tokenRef" class="chart-box" />
      </ElCard>
    </div>

    <!-- 最近任务 -->
    <ElCard shadow="never">
      <div class="recent-header">
        <span class="chart-title">最近任务</span>
        <ElButton link type="primary" @click="router.push('/review/task')">查看全部</ElButton>
      </div>
      <ElTable
        :data="recentTasks"
        stripe
        size="small"
        @row-click="(r: any) => router.push(`/review/task/detail?id=${r.id}`)"
        style="cursor: pointer"
      >
        <ElTableColumn label="仓库" prop="repoName" min-width="130">
          <template #default="{ row }">{{ row.repoName ?? '-' }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="红线" width="90">
          <template #default="{ row }">
            <ElTag v-if="row.gateStatus === 'PASS'" type="success" size="small">通过</ElTag>
            <ElTag v-else-if="row.gateStatus === 'FAIL'" type="danger" size="small">未通过</ElTag>
            <span v-else>-</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="发现数" prop="comments" width="80" />
        <ElTableColumn label="耗时" width="100">
          <template #default="{ row }">{{
            row.finishedAt && row.startedAt
              ? `${Math.round((new Date(row.finishedAt).getTime() - new Date(row.startedAt).getTime()) / 1000)}s`
              : '-'
          }}</template>
        </ElTableColumn>
        <ElTableColumn label="创建时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </ElTableColumn>
      </ElTable>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { Cpu, Document, Lightning, Trophy } from '@element-plus/icons-vue'
  import * as echarts from 'echarts'
  import { reviewApi } from '@/api/review'
  import { useNoticeStore } from '@/store/modules/notice'

  defineOptions({ name: 'ReviewDashboard' })

  const router = useRouter()
  const noticeStore = useNoticeStore()
  const stats = ref<Api.Review.DashboardStats | null>(null)
  const trendRef = ref<HTMLElement>()
  const categoryRef = ref<HTMLElement>()
  const tokenRef = ref<HTMLElement>()

  const statCards = computed(() => [
    {
      label: '30 天评审任务',
      value: stats.value?.tasks30d ?? '-',
      icon: Document,
      color: 'var(--el-color-primary)',
      bg: 'var(--el-color-primary-light-9)'
    },
    {
      label: '成功率',
      value: stats.value != null ? `${stats.value.successRate30d}%` : '-',
      icon: Trophy,
      color: 'var(--el-color-success)',
      bg: 'var(--el-color-success-light-9)'
    },
    {
      label: '待处理问题',
      value: stats.value?.openFindings ?? '-',
      icon: Lightning,
      color: 'var(--el-color-warning)',
      bg: 'var(--el-color-warning-light-9)'
    },
    {
      label: '红线通过率',
      value: stats.value != null ? `${stats.value.gatePassRate30d}%` : '-',
      icon: Trophy,
      color: 'var(--el-color-danger)',
      bg: 'var(--el-color-danger-light-9)'
    },
    {
      label: 'Token 消耗（30 天）',
      value: stats.value?.totalTokens30d?.toLocaleString() ?? '-',
      icon: Cpu,
      color: 'var(--el-color-info)',
      bg: 'var(--el-color-info-light-9)'
    }
  ])

  const recentTasks = computed(() => stats.value?.recentTasks ?? [])

  const formatTime = (s: string | null) =>
    s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '-'
  function statusLabel(s: string): string {
    const m: Record<string, string> = {
      PENDING: '排队中',
      PREPARING: '准备中',
      RUNNING: '评审中',
      EVALUATING: '评估中',
      SUCCESS: '完成',
      FAILED: '失败',
      CANCELLED: '已取消'
    }
    return m[s] ?? s
  }
  function statusType(s: string): 'primary' | 'success' | 'danger' | 'warning' | 'info' {
    const m: Record<string, 'primary' | 'success' | 'danger' | 'warning' | 'info'> = {
      PENDING: 'info',
      PREPARING: 'info',
      RUNNING: 'primary',
      EVALUATING: 'primary',
      SUCCESS: 'success',
      FAILED: 'danger',
      CANCELLED: 'warning'
    }
    return m[s] ?? 'info'
  }

  function renderCharts(): void {
    if (!stats.value) return
    const s = stats.value

    if (trendRef.value) {
      const chart = echarts.init(trendRef.value)
      chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { top: 0, textStyle: { fontSize: 11 } },
        grid: { left: 40, right: 10, top: 30, bottom: 30 },
        xAxis: { type: 'category', data: s.severityTrend.map((d) => d.date.slice(5)) },
        yAxis: { type: 'value' },
        series: (['critical', 'high', 'medium', 'low'] as const).map((sev) => ({
          name: sev,
          type: 'line',
          smooth: true,
          data: s.severityTrend.map((d) => d[sev]),
          itemStyle: {
            color: { critical: '#f56c6c', high: '#e6a23c', medium: '#409eff', low: '#909399' }[sev]
          }
        }))
      })
    }

    if (categoryRef.value) {
      const chart = echarts.init(categoryRef.value)
      chart.setOption({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, textStyle: { fontSize: 11 } },
        series: [
          {
            type: 'pie',
            radius: ['45%', '70%'],
            center: ['50%', '45%'],
            data: s.categoryDist.map((c) => ({ name: c.category, value: c.count })),
            label: { fontSize: 11 }
          }
        ]
      })
    }

    if (tokenRef.value) {
      const chart = echarts.init(tokenRef.value)
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 60, right: 10, top: 20, bottom: 30 },
        xAxis: { type: 'category', data: s.dailyTokens.map((d) => d.date.slice(5)) },
        yAxis: { type: 'value' },
        series: [
          {
            type: 'bar',
            data: s.dailyTokens.map((d) => d.tokens),
            itemStyle: { color: '#409eff', borderRadius: [3, 3, 0, 0] }
          }
        ]
      })
    }
  }

  onMounted(async () => {
    const data = await reviewApi.fetchDashboardStats()
    stats.value = data
    renderCharts()
    void noticeStore.refreshUnread()
  })

  watch(stats, () => setTimeout(renderCharts, 50))
</script>

<style scoped lang="scss">
  .review-dashboard {
    min-height: 0;
    overflow-y: auto;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 12px;

    .stat-card :deep(.el-card__body) {
      padding: 16px;
    }

    .stat-content {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .stat-icon {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 10px;
    }

    .stat-value {
      font-size: 22px;
      font-weight: 700;
    }

    .stat-label {
      margin-top: 2px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }

  .charts-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;

    .chart-card :deep(.el-card__body) {
      padding: 14px;
    }

    .chart-box {
      height: 220px;
    }
  }

  .chart-title {
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 600;
  }

  .recent-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  @media (width <= 1200px) {
    .charts-row {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
