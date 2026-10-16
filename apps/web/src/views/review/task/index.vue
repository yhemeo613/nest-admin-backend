<template>
  <div class="art-full-height">
    <!-- 搜索筛选 -->
    <ElCard class="mb-3" shadow="never">
      <ElForm :model="searchForm" inline>
        <ElFormItem label="仓库">
          <ElSelect v-model="searchForm.repoId" placeholder="全部" clearable style="width: 160px">
            <ElOption v-for="r in repoOptions" :key="r.id" :label="r.name" :value="r.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="searchForm.status" placeholder="全部" clearable style="width: 130px">
            <ElOption v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="红线">
          <ElSelect
            v-model="searchForm.gateStatus"
            placeholder="全部"
            clearable
            style="width: 110px"
          >
            <ElOption label="通过" value="PASS" />
            <ElOption label="未通过" value="FAIL" />
            <ElOption label="未评估" value="SKIPPED" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="handleSearch" v-ripple>搜索</ElButton>
          <ElButton @click="handleReset" v-ripple>重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <ElCard class="art-table-card" shadow="never">
      <div class="flex-cb mb-3">
        <ElButton
          type="primary"
          @click="openCreate"
          v-auth="PermissionCode.ReviewTaskCreate"
          v-ripple
        >
          <ElIcon class="mr-1"><Plus /></ElIcon>新建评审
        </ElButton>
        <ElButton circle @click="loadData" v-ripple
          ><ElIcon><Refresh /></ElIcon
        ></ElButton>
      </div>

      <ElTable :data="list" v-loading="loading" row-key="id" stripe>
        <ElTableColumn label="仓库 / 输入" min-width="200">
          <template #default="{ row }">
            <div class="task-repo">{{ row.repoName ?? '-' }}</div>
            <div class="task-input">{{ inputSummary(row) }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="150">
          <template #default="{ row }">
            <div class="task-status">
              <ElTag :type="statusType(row.status)" size="small">{{
                statusLabel(row.status)
              }}</ElTag>
              <ElProgress
                v-if="['PENDING', 'PREPARING', 'RUNNING', 'EVALUATING'].includes(row.status)"
                :percentage="row.progress"
                :stroke-width="4"
                class="mt-1"
              />
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="发现" width="160">
          <template #default="{ row }">
            <div class="severity-badges">
              <span
                v-for="sev in ['critical', 'high', 'medium', 'low']"
                :key="sev"
                class="sev-badge"
                :class="`sev-${sev}`"
                :title="sev"
                >{{ row.severityCount?.[sev] ?? 0 }}</span
              >
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="红线" width="90">
          <template #default="{ row }">
            <ElTag v-if="row.gateStatus === 'PASS'" type="success" size="small">通过</ElTag>
            <ElTag v-else-if="row.gateStatus === 'FAIL'" type="danger" size="small">未通过</ElTag>
            <span v-else class="text-secondary">-</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="耗时 / Token" width="150">
          <template #default="{ row }">
            <div class="meta-line">{{ row.stats?.elapsed ?? '-' }}</div>
            <div class="meta-line text-secondary">{{ row.stats?.totalTokens ?? '-' }} tok</div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click="openDetail(row)">详情</ElButton>
            <ElButton
              v-if="['PENDING', 'PREPARING', 'RUNNING', 'EVALUATING'].includes(row.status)"
              link
              type="warning"
              @click="handleCancel(row)"
              v-auth="PermissionCode.ReviewTaskCancel"
              >取消</ElButton
            >
            <ElButton
              v-else
              link
              type="primary"
              @click="handleRerun(row)"
              v-auth="PermissionCode.ReviewTaskRerun"
              >重跑</ElButton
            >
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="flex justify-end mt-4">
        <ElPagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadData"
          @size-change="loadData"
        />
      </div>
    </ElCard>

    <!-- 新建评审 -->
    <ElDialog v-model="createVisible" title="新建评审任务" width="560px">
      <ElForm ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <ElFormItem label="仓库" prop="repoId">
          <ElSelect
            v-model="createForm.repoId"
            placeholder="选择仓库"
            style="width: 100%"
            @change="onRepoChange"
          >
            <ElOption v-for="r in repoOptions" :key="r.id" :label="r.name" :value="r.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="评审模式" prop="mode">
          <ElRadioGroup v-model="createForm.mode">
            <ElRadioButton value="RANGE">分支区间</ElRadioButton>
            <ElRadioButton value="COMMIT">单提交</ElRadioButton>
            <ElRadioButton value="MR">MR/PR 链接</ElRadioButton>
          </ElRadioGroup>
        </ElFormItem>

        <template v-if="createForm.mode === 'RANGE'">
          <ElFormItem label="基准 ref" prop="fromRef">
            <ElInput v-model="createForm.fromRef" placeholder="如 main / v1.2.0 / abc1234" />
          </ElFormItem>
          <ElFormItem label="目标 ref" prop="toRef">
            <ElInput v-model="createForm.toRef" :placeholder="`缺省 = 仓库默认分支`" />
          </ElFormItem>
        </template>
        <ElFormItem v-else-if="createForm.mode === 'COMMIT'" label="提交 SHA" prop="commitSha">
          <ElInput v-model="createForm.commitSha" placeholder="如 a1b2c3d4" />
        </ElFormItem>
        <ElFormItem v-else label="MR/PR 链接" prop="mrUrl">
          <ElInput
            v-model="createForm.mrUrl"
            placeholder="https://gitlab.com/g/r/-/merge_requests/123 或 GitHub PR"
          />
          <div class="form-hint">完成后自动把评审评论回写到 MR/PR 评论区</div>
        </ElFormItem>

        <ElFormItem label="需求背景">
          <ElInput
            v-model="createForm.requirementBackground"
            type="textarea"
            :rows="2"
            placeholder="可选：本次变更的业务背景，帮助 AI 更准确评审"
          />
        </ElFormItem>
        <ElFormItem label="模型">
          <ElSelect
            v-model="createForm.modelId"
            placeholder="默认模型"
            clearable
            style="width: 100%"
          >
            <ElOption v-for="m in modelOptions" :key="m.id" :label="m.name" :value="m.id" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="createVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitCreate">提交评审</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Plus, Refresh } from '@element-plus/icons-vue'
  import { PermissionCode } from '@nestperm/contracts'
  import { reviewApi } from '@/api/review'

  defineOptions({ name: 'ReviewTask' })

  const router = useRouter()
  const loading = ref(false)
  const submitting = ref(false)
  const list = ref<Api.Review.TaskItem[]>([])
  const total = ref(0)
  const repoOptions = ref<Api.Review.RepoItem[]>([])
  const modelOptions = ref<Api.Review.ModelItem[]>([])

  const searchForm = reactive({ repoId: '', status: '', gateStatus: '' })
  const query = reactive({ page: 1, pageSize: 20 })

  const formatTime = (s: string | null) =>
    s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '-'

  const statusOptions = [
    { value: 'PENDING', label: '排队中' },
    { value: 'RUNNING', label: '执行中' },
    { value: 'SUCCESS', label: '完成' },
    { value: 'FAILED', label: '失败' },
    { value: 'CANCELLED', label: '已取消' }
  ]

  const createVisible = ref(false)
  const createFormRef = ref()
  const createForm = reactive({
    repoId: '',
    mode: 'RANGE' as Api.Review.TaskMode,
    fromRef: '',
    toRef: '',
    commitSha: '',
    mrUrl: '',
    requirementBackground: '',
    modelId: ''
  })
  const createRules = {
    repoId: [{ required: true, message: '请选择仓库', trigger: 'change' }],
    fromRef: [{ required: true, message: 'RANGE 模式需要基准 ref', trigger: 'blur' }],
    commitSha: [{ required: true, message: 'COMMIT 模式需要提交 SHA', trigger: 'blur' }],
    mrUrl: [{ required: true, message: 'MR 模式需要链接', trigger: 'blur' }]
  }

  async function loadData(): Promise<void> {
    loading.value = true
    try {
      const res = await reviewApi.fetchTasks({
        page: query.page,
        pageSize: query.pageSize,
        ...(searchForm.repoId && { repoId: searchForm.repoId }),
        ...(searchForm.status && { status: searchForm.status }),
        ...(searchForm.gateStatus && { gateStatus: searchForm.gateStatus })
      })
      list.value = res.list
      total.value = res.total
    } finally {
      loading.value = false
    }
  }

  async function loadOptions(): Promise<void> {
    const [repos, models] = await Promise.all([
      reviewApi.fetchRepos({ pageSize: 100 }),
      reviewApi.fetchModels({ pageSize: 100 })
    ])
    repoOptions.value = repos.list
    modelOptions.value = models.list
  }

  function inputSummary(row: Api.Review.TaskItem): string {
    if (row.mode === 'MR') return `MR: ${row.mrUrl ?? ''}`
    if (row.mode === 'COMMIT') return `commit ${row.commitSha?.slice(0, 8) ?? ''}`
    return `${row.fromRef ?? '?'}..${row.toRef ?? '?'}`
  }

  function statusLabel(s: string): string {
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

  function statusType(s: string): 'primary' | 'success' | 'danger' | 'warning' | 'info' {
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

  function handleSearch(): void {
    query.page = 1
    void loadData()
  }

  function handleReset(): void {
    Object.assign(searchForm, { repoId: '', status: '', gateStatus: '' })
    query.page = 1
    void loadData()
  }

  function openCreate(): void {
    Object.assign(createForm, {
      repoId: '',
      mode: 'RANGE',
      fromRef: '',
      toRef: '',
      commitSha: '',
      mrUrl: '',
      requirementBackground: '',
      modelId: ''
    })
    createVisible.value = true
  }

  function onRepoChange(repoId: string): void {
    const repo = repoOptions.value.find((r) => r.id === repoId)
    if (repo && !createForm.toRef) createForm.toRef = repo.defaultBranch
  }

  async function submitCreate(): Promise<void> {
    await createFormRef.value?.validate()
    submitting.value = true
    try {
      const task = await reviewApi.createTask({
        repoId: createForm.repoId,
        mode: createForm.mode,
        ...(createForm.modelId && { modelId: createForm.modelId }),
        ...(createForm.fromRef && { fromRef: createForm.fromRef }),
        ...(createForm.toRef && { toRef: createForm.toRef }),
        ...(createForm.commitSha && { commitSha: createForm.commitSha }),
        ...(createForm.mrUrl && { mrUrl: createForm.mrUrl }),
        ...(createForm.requirementBackground && {
          requirementBackground: createForm.requirementBackground
        })
      })
      ElMessage.success('评审任务已入队')
      createVisible.value = false
      router.push(`/review/task/detail?id=${task.id}`)
    } finally {
      submitting.value = false
    }
  }

  function openDetail(row: Api.Review.TaskItem): void {
    router.push(`/review/task/detail?id=${row.id}`)
  }

  async function handleCancel(row: Api.Review.TaskItem): Promise<void> {
    await ElMessageBox.confirm('确认取消该评审任务？', '取消任务', { type: 'warning' })
    await reviewApi.cancelTask(row.id)
    ElMessage.success('已取消')
    void loadData()
  }

  async function handleRerun(row: Api.Review.TaskItem): Promise<void> {
    const task = await reviewApi.rerunTask(row.id)
    ElMessage.success('已重新入队')
    router.push(`/review/task/detail?id=${task.id}`)
  }

  onMounted(() => {
    void loadData()
    void loadOptions()
  })
</script>

<style scoped lang="scss">
  .task-repo {
    font-size: 13px;
    font-weight: 600;
  }

  .task-input {
    margin-top: 2px;
    font-family: monospace;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .task-status {
    min-width: 0;
  }

  .severity-badges {
    display: flex;
    gap: 4px;

    .sev-badge {
      width: 22px;
      height: 18px;
      font-size: 11px;
      font-weight: 600;
      line-height: 18px;
      text-align: center;
      border-radius: 3px;

      &.sev-critical {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }

      &.sev-high {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }

      &.sev-medium {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
      }

      &.sev-low {
        color: var(--el-color-info);
        background: var(--el-color-info-light-9);
      }
    }
  }

  .meta-line {
    font-size: 12px;
  }

  .form-hint {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
</style>
