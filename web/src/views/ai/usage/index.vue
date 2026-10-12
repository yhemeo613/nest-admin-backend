<!-- AI 用量报表 -->
<template>
  <div class="art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <div class="flex-cb mb-3">
        <div class="text-base font-medium">AI 用量汇总（按厂商 / 模型）</div>
        <ElButton circle @click="loadData" v-ripple>
          <ElIcon><Refresh /></ElIcon>
        </ElButton>
      </div>

      <ElTable :data="list" v-loading="loading" stripe>
        <ElTableColumn prop="provider" label="厂商" width="120" />
        <ElTableColumn prop="model" label="模型" min-width="160">
          <template #default="{ row }">{{ row.model || '-' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="calls" label="调用次数" width="110" />
        <ElTableColumn prop="promptTokens" label="输入 Tokens" width="130" />
        <ElTableColumn prop="completionTokens" label="输出 Tokens" width="130" />
        <ElTableColumn prop="totalTokens" label="总 Tokens" width="120" />
        <ElTableColumn prop="costEstimate" label="估算成本（元）" min-width="140">
          <template #default="{ row }">
            <span v-if="row.costEstimate != null">¥{{ row.costEstimate }}</span>
            <span v-else class="text-g-500">未配置单价</span>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { fetchGetAiUsage } from '@/api/system-manage'
  import { Refresh } from '@element-plus/icons-vue'

  defineOptions({ name: 'AiUsage' })

  const loading = ref(false)
  const list = ref<Api.SystemManage.AiUsageItem[]>([])

  const loadData = async () => {
    loading.value = true
    try {
      list.value = await fetchGetAiUsage()
    } finally {
      loading.value = false
    }
  }

  onMounted(loadData)
</script>
