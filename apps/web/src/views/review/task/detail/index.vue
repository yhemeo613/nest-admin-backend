<template>
  <div class="art-full-height task-detail" v-loading="loading">
    <!-- 头部概览 -->
    <ElCard shadow="never" class="mb-3">
      <div class="detail-header">
        <div class="detail-left">
          <ElButton link @click="router.back()"
            ><ElIcon><ArrowLeft /></ElIcon>返回</ElButton
          >
          <ElDivider direction="vertical" />
          <span class="detail-repo">{{ task?.repoName ?? '-' }}</span>
          <span class="detail-input">{{ inputSummary }}</span>
        </div>
        <div class="detail-right">
          <ElTag :type="statusType" size="large">{{ statusLabel }}</ElTag>
          <ElTag
            v-if="task?.gateStatus"
            :type="task.gateStatus === 'PASS' ? 'success' : 'danger'"
            size="large"
          >
            红线{{ task.gateStatus === 'PASS' ? '通过' : '未通过' }}
          </ElTag>
          <ElButton
            v-if="isRunning"
            type="warning"
            size="small"
            @click="handleCancel"
            v-auth="PermissionCode.ReviewTaskCancel"
            >取消</ElButton
          >
          <ElButton
            v-else
            type="primary"
            size="small"
            @click="handleRerun"
            v-auth="PermissionCode.ReviewTaskRerun"
            >重跑</ElButton
          >
          <ElButton
            v-if="task?.mrUrl"
            size="small"
            :loading="publishing"
            @click="handlePublish"
            v-auth="PermissionCode.ReviewTaskPublish"
            >{{ task.mrState === 'PUBLISHED' ? '重新回写' : '回写 MR' }}</ElButton
          >
        </div>
      </div>

      <!-- 进度与统计 -->
      <div class="detail-stats">
        <div class="stat">
          <div class="stat-label">进度</div>
          <ElProgress
            :percentage="task?.progress ?? 0"
            :status="
              task?.status === 'SUCCESS'
                ? 'success'
                : task?.status === 'FAILED'
                  ? 'exception'
                  : undefined
            "
            style="width: 180px"
          />
        </div>
        <div class="stat"
          ><div class="stat-label">耗时</div
          ><div class="stat-value">{{ task?.stats?.elapsed ?? elapsedLive }}</div></div
        >
        <div class="stat"
          ><div class="stat-label">Token</div
          ><div class="stat-value">{{ task?.stats?.totalTokens ?? '-' }}</div></div
        >
        <div class="stat"
          ><div class="stat-label">评审文件</div
          ><div class="stat-value">{{ task?.stats?.filesReviewed ?? '-' }}</div></div
        >
        <div class="stat"
          ><div class="stat-label">模型</div
          ><div class="stat-value">{{ task?.modelName ?? '-' }}</div></div
        >
        <div class="stat" v-if="task?.mrDiscussionUrl">
          <div class="stat-label">回写</div>
          <a :href="task.mrDiscussionUrl" target="_blank" class="stat-link">查看 MR 评论</a>
        </div>
      </div>

      <!-- 红线原因 -->
      <ElAlert
        v-if="task?.gateStatus === 'FAIL' && gateReasons.length"
        type="error"
        :closable="false"
        class="mt-2"
        :title="'质量红线未通过：' + gateReasons.join('；')"
      />

      <!-- 错误信息 -->
      <ElAlert v-if="task?.error" type="error" :closable="false" class="mt-2" :title="task.error" />
    </ElCard>

    <!-- 内容 Tabs -->
    <ElCard shadow="never" class="detail-body">
      <ElTabs v-model="activeTab">
        <!-- Tab 1: 发现 -->
        <ElTabPane name="findings">
          <template #label>
            发现
            <ElBadge v-if="findings.length" :value="findings.length" type="primary" class="ml-1" />
          </template>

          <div class="findings-layout">
            <!-- 筛选侧栏 -->
            <div class="findings-filter">
              <div class="filter-section">
                <div class="filter-title">严重级</div>
                <div
                  v-for="s in ['critical', 'high', 'medium', 'low']"
                  :key="s"
                  class="filter-item"
                  :class="{ active: filter.severity === s }"
                  @click="toggleFilter('severity', s)"
                >
                  <span class="filter-dot" :class="`dot-${s}`" />{{ s }}
                  <span class="filter-count">{{ severityCount(s) }}</span>
                </div>
              </div>
              <div class="filter-section">
                <div class="filter-title">类型</div>
                <div
                  v-for="c in categoryList"
                  :key="c"
                  class="filter-item"
                  :class="{ active: filter.category === c }"
                  @click="toggleFilter('category', c)"
                  >{{ c }}</div
                >
              </div>
              <div class="filter-section">
                <div class="filter-title">状态</div>
                <div
                  v-for="(l, s) in statusFilters"
                  :key="s"
                  class="filter-item"
                  :class="{ active: filter.status === s }"
                  @click="toggleFilter('status', s)"
                  >{{ l }}</div
                >
              </div>
              <div class="filter-section">
                <ElCheckbox v-model="filter.onlyNew" label="只看新增" />
              </div>
            </div>

            <!-- 发现列表 -->
            <div class="findings-list">
              <ElEmpty v-if="!filteredFindings.length" description="无匹配发现" />
              <FindingCard
                v-for="f in filteredFindings"
                :key="f.id"
                :finding="f"
                @update-status="handleUpdateFinding"
                @locate="handleLocate"
              />
            </div>
          </div>
        </ElTabPane>

        <!-- Tab 2: Diff -->
        <ElTabPane label="变更 Diff" name="diff" lazy>
          <div v-loading="diffLoading">
            <DiffView v-if="diffText" :diff-text="diffText" :anchor="diffAnchor" />
            <ElEmpty v-else-if="!diffLoading" description="diff 尚未生成（任务未执行或无变更）" />
          </div>
        </ElTabPane>

        <!-- Tab 3: 执行轨迹（思维链） -->
        <ElTabPane name="trace">
          <template #label>
            执行轨迹
            <ElBadge
              v-if="traceCalls.length"
              :value="traceCalls.length"
              type="primary"
              class="ml-1"
            />
          </template>
          <div class="trace-header">
            <span class="text-secondary" style="font-size: 12px">
              {{ isRunning ? '实时接收中（SSE）' : `共 ${traceCalls.length} 次 LLM 调用` }}
            </span>
            <ElButton size="small" link @click="loadTraceCalls">刷新</ElButton>
          </div>
          <TraceTimeline :task-id="taskId" :calls="traceCalls" />
        </ElTabPane>

        <!-- Tab 4: 覆盖率 -->
        <ElTabPane label="覆盖率" name="manifest" lazy>
          <ElTable :data="manifestItems" stripe size="small">
            <ElTableColumn prop="path" label="文件" min-width="200" show-overflow-tooltip />
            <ElTableColumn label="状态" width="110">
              <template #default="{ row }">
                <ElTag
                  :type="
                    row.status === 'reviewed'
                      ? 'success'
                      : row.status === 'failed'
                        ? 'danger'
                        : 'info'
                  "
                  size="small"
                  >{{ row.status ?? '-' }}</ElTag
                >
              </template>
            </ElTableColumn>
            <ElTableColumn prop="failure_class" label="失败分类" width="130">
              <template #default="{ row }">{{ row.failure_class ?? '-' }}</template>
            </ElTableColumn>
            <ElTableColumn prop="reason" label="原因" min-width="180">
              <template #default="{ row }">{{ row.reason ?? '-' }}</template>
            </ElTableColumn>
          </ElTable>
        </ElTabPane>
      </ElTabs>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { ArrowLeft } from '@element-plus/icons-vue'
  import { PermissionCode } from '@nestperm/contracts'
  import { reviewApi } from '@/api/review'
  import { connectSse, SseConnection } from '@/utils/sse'
  import { useUserStore } from '@/store/modules/user'
  import FindingCard from '@/components/business/review/finding-card.vue'
  import TraceTimeline from '@/components/business/review/trace-timeline.vue'
  import DiffView from '@/components/business/review/diff-view.vue'

  defineOptions({ name: 'ReviewTaskDetail' })

  const route = useRoute()
  const router = useRouter()
  const taskId = String(route.query.id ?? '')

  const loading = ref(false)
  const publishing = ref(false)
  const diffLoading = ref(false)
  const task = ref<Api.Review.TaskItem | null>(null)
  const findings = ref<Api.Review.FindingItem[]>([])
  const traceCalls = ref<Api.Review.TraceCallItem[]>([])
  const diffText = ref('')
  const diffAnchor = ref<{ path: string; line: number } | null>(null)
  const manifestItems = ref<
    Array<{ path?: string; status?: string; failure_class?: string; reason?: string }>
  >([])
  const activeTab = ref('findings')

  const filter = reactive({ severity: '', category: '', status: '', onlyNew: false })

  let sseConn: SseConnection | null = null

  const isRunning = computed(() =>
    ['PENDING', 'PREPARING', 'RUNNING', 'EVALUATING'].includes(task.value?.status ?? '')
  )
  const elapsedLive = computed(() =>
    task.value?.startedAt
      ? `${Math.round((Date.now() - new Date(task.value.startedAt).getTime()) / 1000)}s`
      : '-'
  )
  const inputSummary = computed(() => {
    if (!task.value) return ''
    if (task.value.mode === 'MR') return `MR: ${task.value.mrUrl ?? ''}`
    if (task.value.mode === 'COMMIT') return `commit ${task.value.commitSha?.slice(0, 8) ?? ''}`
    return `${task.value.fromRef ?? '?'}..${task.value.toRef ?? '?'}`
  })
  const gateReasons = computed(
    () => (task.value?.gateDetail as { reasons?: string[] } | null)?.reasons ?? []
  )
  const categoryList = computed(() => [...new Set(findings.value.map((f) => f.category))])
  const statusFilters: Record<string, string> = {
    OPEN: '待处理',
    FIXED: '已修复',
    IGNORED: '已忽略'
  }

  const filteredFindings = computed(() =>
    findings.value.filter(
      (f) =>
        (!filter.severity || f.severity === filter.severity) &&
        (!filter.category || f.category === filter.category) &&
        (!filter.status || f.status === filter.status) &&
        (!filter.onlyNew || f.isNew)
    )
  )

  function severityCount(s: string): number {
    return findings.value.filter((f) => f.severity === s).length
  }

  function toggleFilter(key: 'severity' | 'category' | 'status', value: string): void {
    filter[key] = filter[key] === value ? '' : value
  }

  function statusLabelFn(s: string): string {
    const map: Record<string, string> = {
      PENDING: '排队中',
      PREPARING: '准备中',
      RUNNING: '评审中',
      EVALUATING: '评估中',
      SUCCESS: '完成',
      FAILED: '失败',
      CANCELLED: '已取消'
    }
    return map[s] ?? s
  }

  function statusTypeFn(s: string): 'primary' | 'success' | 'danger' | 'warning' | 'info' {
    const map: Record<string, 'primary' | 'success' | 'danger' | 'warning' | 'info'> = {
      PENDING: 'info',
      PREPARING: 'info',
      RUNNING: 'primary',
      EVALUATING: 'primary',
      SUCCESS: 'success',
      FAILED: 'danger',
      CANCELLED: 'warning'
    }
    return map[s] ?? 'info'
  }

  const statusLabel = computed(() => statusLabelFn(task.value?.status ?? ''))
  const statusType = computed(() => statusTypeFn(task.value?.status ?? ''))

  async function loadAll(): Promise<void> {
    loading.value = true
    try {
      const [t, f, calls] = await Promise.all([
        reviewApi.fetchTask(taskId),
        reviewApi.fetchFindings(taskId),
        reviewApi.fetchTraceCalls(taskId)
      ])
      task.value = t
      findings.value = f
      traceCalls.value = calls
    } finally {
      loading.value = false
    }
  }

  async function loadTraceCalls(): Promise<void> {
    traceCalls.value = await reviewApi.fetchTraceCalls(taskId)
  }

  async function loadDiff(): Promise<void> {
    if (diffText.value || diffLoading.value) return
    diffLoading.value = true
    try {
      // diff 是 text/plain @SkipWrap：直接 fetch（带 token）
      const res = await fetch(`/api/v1/review/tasks/${taskId}/diff`, {
        headers: { authorization: `Bearer ${useUserStore().accessToken}` }
      })
      diffText.value = res.ok ? await res.text() : ''
    } finally {
      diffLoading.value = false
    }
  }

  async function loadManifest(): Promise<void> {
    const m = await reviewApi.fetchManifest(taskId)
    manifestItems.value = m?.items ?? []
  }

  function connectSse_(): void {
    sseConn?.close()
    sseConn = connectSse(`/api/v1/review/tasks/${taskId}/events`, {
      onMessage: (ev: Record<string, unknown>) => {
        const e = ev as { type: string; [k: string]: unknown }
        if (e.type === 'snapshot') {
          if (task.value) {
            task.value.status = e.status as Api.Review.TaskStatus
            task.value.stage = e.stage as string
            task.value.progress = e.progress as number
          }
        } else if (e.type === 'stage') {
          if (task.value) {
            task.value.stage = e.stage as string
            task.value.progress = e.progress as number
          }
        } else if (e.type === 'trace_call') {
          const call = e.call as Api.Review.TraceCallItem
          traceCalls.value = [...traceCalls.value, call]
        } else if (e.type === 'finished') {
          // 完成后全量刷新（findings/gate/stats 都在 finalize 阶段落库）
          void loadAll()
          sseConn?.close()
        }
      },
      onError: () => {
        // 连接断开：任务仍在运行时重连
        if (isRunning.value) {
          sseConn?.close()
          setTimeout(connectSse_, 5_000)
        }
      }
    })
  }

  async function handleUpdateFinding(
    finding: Api.Review.FindingItem,
    status: Api.Review.FindingStatus
  ): Promise<void> {
    await reviewApi.updateFinding(finding.id, status)
    finding.status = status
    ElMessage.success('已更新')
  }

  function handleLocate(finding: Api.Review.FindingItem): void {
    activeTab.value = 'diff'
    diffAnchor.value = { path: finding.path, line: finding.startLine }
    void loadDiff()
  }

  async function handleCancel(): Promise<void> {
    await ElMessageBox.confirm('确认取消？执行中的 AI 评审将被终止。', '取消任务', {
      type: 'warning'
    })
    await reviewApi.cancelTask(taskId)
    ElMessage.success('已取消')
    void loadAll()
  }

  async function handleRerun(): Promise<void> {
    const newTask = await reviewApi.rerunTask(taskId)
    ElMessage.success('已重新入队')
    router.replace(`/review/task/detail?id=${newTask.id}`)
  }

  async function handlePublish(): Promise<void> {
    publishing.value = true
    try {
      const r = await reviewApi.publishTask(taskId)
      ElMessage.success(
        `回写完成：${r.inlineCount} 条行内评论${r.inlineFailed ? `，${r.inlineFailed} 条失败` : ''}`
      )
      void loadAll()
    } finally {
      publishing.value = false
    }
  }

  onMounted(async () => {
    await loadAll()
    void loadManifest()
    if (isRunning.value) connectSse_()
    if (activeTab.value === 'diff') void loadDiff()
  })

  onUnmounted(() => sseConn?.close())
</script>

<style scoped lang="scss">
  .task-detail {
    display: flex;
    flex-direction: column;
  }

  .detail-header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    .detail-left {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }

    .detail-repo {
      font-weight: 600;
    }

    .detail-input {
      max-width: 400px;
      overflow: hidden;
      font-family: monospace;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .detail-right {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  }

  .detail-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 28px;
    margin-top: 12px;

    .stat {
      .stat-label {
        margin-bottom: 4px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      .stat-value {
        font-size: 15px;
        font-weight: 600;
      }

      .stat-link {
        font-size: 13px;
        color: var(--el-color-primary);
      }
    }
  }

  .detail-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;

    :deep(.el-tabs) {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    :deep(.el-tabs__content) {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    :deep(.el-tab-pane) {
      height: 100%;
      overflow: hidden;
    }
  }

  .findings-layout {
    display: flex;
    gap: 0;
    height: 100%;
    min-height: 0;

    .findings-filter {
      flex-shrink: 0;
      width: 160px;
      padding-right: 12px;
      overflow-y: auto;
      border-right: 1px solid var(--el-border-color-lighter);

      .filter-section {
        margin-bottom: 16px;

        .filter-title {
          margin-bottom: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--el-text-color-secondary);
        }

        .filter-item {
          display: flex;
          gap: 6px;
          align-items: center;
          padding: 4px 8px;
          font-size: 12.5px;
          color: var(--el-text-color-regular);
          cursor: pointer;
          border-radius: 4px;

          &:hover,
          &.active {
            color: var(--el-color-primary);
            background: var(--el-color-primary-light-9);
          }

          .filter-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;

            &.dot-critical {
              background: var(--el-color-danger);
            }

            &.dot-high {
              background: var(--el-color-warning);
            }

            &.dot-medium {
              background: var(--el-color-primary);
            }

            &.dot-low {
              background: var(--el-color-info);
            }
          }

          .filter-count {
            margin-left: auto;
            font-size: 11px;
            color: var(--el-text-color-secondary);
          }
        }
      }
    }

    .findings-list {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      padding-left: 14px;
      overflow-y: auto;
    }
  }

  .trace-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
</style>
