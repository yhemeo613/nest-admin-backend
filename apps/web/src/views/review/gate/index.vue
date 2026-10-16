<template>
  <div class="art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <div class="flex-cb mb-3">
        <span class="page-desc">
          质量红线：任务评审完成后自动评估；仓库规则优先于全局规则。空 = 不限制。
        </span>
        <ElButton
          type="primary"
          @click="openDialog()"
          v-auth="PermissionCode.ReviewGateEdit"
          v-ripple
        >
          <ElIcon class="mr-1"><Plus /></ElIcon>新增规则
        </ElButton>
      </div>

      <ElTable :data="list" v-loading="loading" row-key="id" stripe>
        <ElTableColumn label="作用域" min-width="140">
          <template #default="{ row }">
            <ElTag v-if="!row.repoId" type="primary" size="small" effect="plain">全局默认</ElTag>
            <span v-else>{{ row.repoName ?? row.repoId }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="critical 上限" width="120">
          <template #default="{ row }">
            <ElTag v-if="row.maxCritical !== null" type="danger" size="small">{{
              row.maxCritical
            }}</ElTag>
            <span v-else class="text-secondary">不限制</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="high 上限" width="120">
          <template #default="{ row }">
            <ElTag v-if="row.maxHigh !== null" type="warning" size="small">{{ row.maxHigh }}</ElTag>
            <span v-else class="text-secondary">不限制</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="updatedAt" label="更新时间" width="160">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="primary"
              @click="openDialog(row)"
              v-auth="PermissionCode.ReviewGateEdit"
              >编辑</ElButton
            >
            <ElButton
              link
              type="danger"
              @click="handleDelete(row)"
              v-auth="PermissionCode.ReviewGateEdit"
              >删除</ElButton
            >
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDialog v-model="dialogVisible" :title="editingId ? '编辑红线' : '新增红线'" width="460px">
      <ElForm label-width="110px">
        <ElFormItem label="作用域">
          <ElSelect
            v-model="form.repoId"
            placeholder="全局默认"
            clearable
            :disabled="!!editingId"
            style="width: 100%"
          >
            <ElOption label="全局默认" value="" />
            <ElOption v-for="r in repoOptions" :key="r.id" :label="r.name" :value="r.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="critical 上限">
          <ElInputNumber v-model="form.maxCritical" :min="0" :max="999" placeholder="留空不限制" />
          <div class="form-hint">超过即 FAIL；0 = 零容忍。留空（清空）= 不限制</div>
        </ElFormItem>
        <ElFormItem label="high 上限">
          <ElInputNumber v-model="form.maxHigh" :min="0" :max="999" />
          <div class="form-hint">同上；留空 = 不限制</div>
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

  defineOptions({ name: 'ReviewGate' })

  const loading = ref(false)
  const submitting = ref(false)
  const list = ref<Api.Review.GateRuleItem[]>([])
  const repoOptions = ref<Api.Review.RepoItem[]>([])
  const dialogVisible = ref(false)
  const editingId = ref('')

  const form = reactive({
    repoId: '' as string,
    maxCritical: null as number | null,
    maxHigh: null as number | null
  })

  const formatTime = (s: string | null) =>
    s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '-'

  async function loadData(): Promise<void> {
    loading.value = true
    try {
      const [gates, repos] = await Promise.all([
        reviewApi.fetchGates(),
        reviewApi.fetchRepos({ pageSize: 100 })
      ])
      list.value = gates
      repoOptions.value = repos.list
    } finally {
      loading.value = false
    }
  }

  function openDialog(row?: Api.Review.GateRuleItem): void {
    editingId.value = row?.id ?? ''
    form.repoId = row?.repoId ?? ''
    form.maxCritical = row?.maxCritical ?? null
    form.maxHigh = row?.maxHigh ?? null
    dialogVisible.value = true
  }

  async function submitForm(): Promise<void> {
    submitting.value = true
    try {
      const payload = {
        ...(form.repoId && { repoId: form.repoId }),
        maxCritical: form.maxCritical ?? null,
        maxHigh: form.maxHigh ?? null
      }
      if (editingId.value) {
        await reviewApi.updateGate(editingId.value, payload)
        ElMessage.success('已更新')
      } else {
        await reviewApi.createGate(payload)
        ElMessage.success('已创建')
      }
      dialogVisible.value = false
      void loadData()
    } finally {
      submitting.value = false
    }
  }

  async function handleDelete(row: Api.Review.GateRuleItem): Promise<void> {
    const scope = row.repoId ? `仓库「${row.repoName ?? row.repoId}」` : '全局默认'
    await ElMessageBox.confirm(`确认删除 ${scope} 红线？`, '删除', { type: 'warning' })
    await reviewApi.deleteGate(row.id)
    ElMessage.success('已删除')
    void loadData()
  }

  onMounted(loadData)
</script>

<style scoped lang="scss">
  .page-desc {
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .form-hint {
    margin-top: 2px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .text-secondary {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
</style>
