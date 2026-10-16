<template>
  <div class="art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <div class="flex-cb mb-3">
        <ElInput
          v-model="searchKeyword"
          placeholder="仓库名称"
          clearable
          style="width: 220px"
          @keyup.enter="loadData"
          @clear="loadData"
        >
          <template #append><ElButton @click="loadData">搜索</ElButton></template>
        </ElInput>
        <ElButton
          type="primary"
          @click="openDialog('add')"
          v-auth="PermissionCode.ReviewRepoCreate"
          v-ripple
        >
          <ElIcon class="mr-1"><Plus /></ElIcon>登记仓库
        </ElButton>
      </div>

      <ElTable :data="list" v-loading="loading" row-key="id" stripe>
        <ElTableColumn prop="name" label="仓库" min-width="140" />
        <ElTableColumn label="平台" width="100">
          <template #default="{ row }">
            <ElTag
              size="small"
              :type="row.platform === 'GITLAB' ? 'warning' : 'primary'"
              effect="plain"
            >
              {{ row.platform }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="gitUrl" label="地址" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="git-url">{{ row.gitUrl }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="defaultBranch" label="默认分支" width="110" />
        <ElTableColumn label="凭证" width="80">
          <template #default="{ row }">
            <ElTag :type="row.hasCredential ? 'success' : 'info'" size="small" effect="plain">
              {{ row.hasCredential ? '已配' : '无' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="工作区" width="110">
          <template #default="{ row }">
            <ElTag
              :type="
                row.workspaceStatus === 'READY'
                  ? 'success'
                  : row.workspaceStatus === 'ERROR'
                    ? 'danger'
                    : 'info'
              "
              size="small"
            >
              {{ workspaceLabel(row.workspaceStatus) }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="最后同步" width="160">
          <template #default="{ row }">{{ formatTime(row.lastSyncAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="primary"
              @click="handleSync(row)"
              :loading="row._syncing"
              v-auth="PermissionCode.ReviewRepoSync"
              >同步</ElButton
            >
            <ElButton
              link
              type="primary"
              @click="openDialog('edit', row)"
              v-auth="PermissionCode.ReviewRepoEdit"
              >编辑</ElButton
            >
            <ElButton
              link
              type="danger"
              @click="handleDelete(row)"
              v-auth="PermissionCode.ReviewRepoDelete"
              >删除</ElButton
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

    <ElDialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '登记仓库' : '编辑仓库'"
      width="520px"
    >
      <ElForm ref="formRef" :model="form" :rules="rules" label-width="90px">
        <ElFormItem label="名称" prop="name">
          <ElInput v-model="form.name" placeholder="如 nest 后端" />
        </ElFormItem>
        <ElFormItem label="平台" prop="platform">
          <ElRadioGroup v-model="form.platform">
            <ElRadioButton value="GITLAB">GitLab</ElRadioButton>
            <ElRadioButton value="GITHUB">GitHub</ElRadioButton>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="clone 地址" prop="gitUrl">
          <ElInput
            v-model="form.gitUrl"
            placeholder="https://gitlab.com/group/repo.git 或 file:///path（测试）"
          />
        </ElFormItem>
        <ElFormItem label="默认分支">
          <ElInput v-model="form.defaultBranch" placeholder="main" />
        </ElFormItem>
        <ElFormItem label="访问凭证">
          <ElInput
            v-model="form.credential"
            type="password"
            show-password
            placeholder="user:token（加密存储；编辑时留空不变，输入 - 清除）"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitForm">确定</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, reactive, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { Plus } from '@element-plus/icons-vue'
  import { PermissionCode } from '@nestperm/contracts'
  import { reviewApi } from '@/api/review'

  defineOptions({ name: 'ReviewRepo' })

  type RepoRow = Api.Review.RepoItem & { _syncing?: boolean }

  const loading = ref(false)
  const submitting = ref(false)
  const list = ref<RepoRow[]>([])
  const total = ref(0)
  const searchKeyword = ref('')
  const query = reactive({ page: 1, pageSize: 20 })

  const dialogVisible = ref(false)
  const dialogType = ref<'add' | 'edit'>('add')
  const formRef = ref()
  const form = reactive({
    id: '',
    name: '',
    platform: 'GITLAB' as Api.Review.Platform,
    gitUrl: '',
    defaultBranch: 'main',
    credential: ''
  })
  const rules = {
    name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
    platform: [{ required: true, message: '请选择平台', trigger: 'change' }],
    gitUrl: [{ required: true, message: '请输入 clone 地址', trigger: 'blur' }]
  }

  const formatTime = (s: string | null) =>
    s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '-'
  const workspaceLabel = (s: string) =>
    ({ READY: '已就绪', ERROR: '同步失败', NONE: '未同步' })[s] ?? s

  async function loadData(): Promise<void> {
    loading.value = true
    try {
      const res = await reviewApi.fetchRepos({
        ...query,
        ...(searchKeyword.value && { keyword: searchKeyword.value })
      })
      list.value = res.list
      total.value = res.total
    } finally {
      loading.value = false
    }
  }

  function openDialog(type: 'add' | 'edit', row?: RepoRow): void {
    dialogType.value = type
    if (type === 'edit' && row) {
      Object.assign(form, {
        id: row.id,
        name: row.name,
        platform: row.platform,
        gitUrl: row.gitUrl,
        defaultBranch: row.defaultBranch,
        credential: ''
      })
    } else {
      Object.assign(form, {
        id: '',
        name: '',
        platform: 'GITLAB',
        gitUrl: '',
        defaultBranch: 'main',
        credential: ''
      })
    }
    dialogVisible.value = true
  }

  async function submitForm(): Promise<void> {
    await formRef.value?.validate()
    submitting.value = true
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        platform: form.platform,
        gitUrl: form.gitUrl,
        ...(form.defaultBranch && { defaultBranch: form.defaultBranch }),
        ...(form.credential && { credential: form.credential })
      }
      if (dialogType.value === 'add') {
        await reviewApi.createRepo(payload)
        ElMessage.success('登记成功，可点击「同步」准备工作区')
      } else {
        await reviewApi.updateRepo(form.id, payload)
        ElMessage.success('已更新')
      }
      dialogVisible.value = false
      void loadData()
    } finally {
      submitting.value = false
    }
  }

  async function handleSync(row: RepoRow): Promise<void> {
    row._syncing = true
    try {
      const r = await reviewApi.syncRepo(row.id)
      ElMessage[r.workspaceStatus === 'READY' ? 'success' : 'warning'](
        r.workspaceStatus === 'READY' ? '同步成功' : '同步失败，请检查地址/凭证'
      )
      void loadData()
    } finally {
      row._syncing = false
    }
  }

  async function handleDelete(row: RepoRow): Promise<void> {
    await ElMessageBox.confirm(`确认删除仓库「${row.name}」？同时清理工作区。`, '删除仓库', {
      type: 'warning'
    })
    await reviewApi.deleteRepo(row.id)
    ElMessage.success('已删除')
    void loadData()
  }

  onMounted(loadData)
</script>

<style scoped lang="scss">
  .git-url {
    font-family: monospace;
    font-size: 12px;
  }
</style>
