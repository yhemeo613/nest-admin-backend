<!-- SaaS 访客会话 -->
<template>
  <div class="art-full-height">
    <!-- 搜索栏 -->
    <ElCard class="mb-3" shadow="never">
      <ElForm :model="searchForm" inline>
        <ElFormItem label="访客 ID">
          <ElInput
            v-model="searchForm.visitorId"
            placeholder="访客标识"
            clearable
            style="width: 200px"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="searchForm.status" placeholder="全部" clearable style="width: 120px">
            <ElOption label="进行中" value="OPEN" />
            <ElOption label="已结束" value="CLOSED" />
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
        <span class="text-sm text-g-500">访客与 AI 的会话记录（按最近更新排序）</span>
        <ElButton circle @click="loadData" v-ripple>
          <ElIcon><Refresh /></ElIcon>
        </ElButton>
      </div>

      <ElTable :data="list" v-loading="loading" row-key="id" stripe>
        <ElTableColumn prop="tenantName" label="租户" min-width="120">
          <template #default="{ row }">{{ row.tenantName ?? '-' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="visitorId" label="访客 ID" min-width="130">
          <template #default="{ row }">
            <ElTag size="small" type="info">{{ row.visitorId }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="title" label="会话标题" min-width="220">
          <template #default="{ row }">{{ row.title ?? '-' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="状态" width="90">
          <template #default="{ row }">
            <ElTag :type="row.status === 'OPEN' ? 'success' : 'info'" size="small">
              {{ row.status === 'OPEN' ? '进行中' : '已结束' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="messageCount" label="消息数" width="90" align="center" />
        <ElTableColumn prop="updatedAt" label="最近更新" width="170">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="primary"
              @click="openDetail(row)"
              v-auth="'saas:conversation:detail'"
              >查看</ElButton
            >
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="flex justify-end mt-4">
        <ElPagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadData"
          @size-change="loadData"
        />
      </div>
    </ElCard>

    <!-- 会话详情 -->
    <ElDrawer v-model="detailVisible" :title="detail?.title || '会话详情'" size="520px">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <div class="mb-3 text-sm text-g-500">
            租户：{{ detail.tenantName ?? '-' }} | 访客：{{ detail.visitorId }} | 消息数：{{
              detail.messageCount
            }}
          </div>
          <div class="space-y-3">
            <div
              v-for="msg in detail.messages"
              :key="msg.id"
              :class="msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'"
            >
              <div
                :class="[
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
                  msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-g-100 text-g-900'
                ]"
              >
                <div>{{ msg.content }}</div>
                <div
                  :class="['mt-1 text-xs', msg.role === 'user' ? 'text-blue-100' : 'text-g-500']"
                >
                  {{ formatTime(msg.createdAt) }}
                  <template v-if="msg.model"> · {{ msg.model }}</template>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { fetchGetConversationDetail, fetchGetConversationPage } from '@/api/saas'
  import { Refresh } from '@element-plus/icons-vue'

  defineOptions({ name: 'SaasConversation' })

  type ConversationItem = Api.Saas.ConversationItem
  type ConversationDetail = Api.Saas.ConversationDetail

  const loading = ref(false)
  const list = ref<ConversationItem[]>([])
  const total = ref(0)
  const query = reactive({ page: 1, pageSize: 20 })
  const searchForm = reactive({
    visitorId: '',
    status: undefined as string | undefined
  })

  const formatTime = (s: string) =>
    s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '-'

  const loadData = async () => {
    loading.value = true
    try {
      const res = await fetchGetConversationPage({
        ...query,
        visitorId: searchForm.visitorId || undefined,
        status: (searchForm.status as 'OPEN' | 'CLOSED') || undefined
      })
      list.value = res.list
      total.value = res.total
    } finally {
      loading.value = false
    }
  }

  const handleSearch = () => {
    query.page = 1
    loadData()
  }

  const handleReset = () => {
    searchForm.visitorId = ''
    searchForm.status = undefined
    handleSearch()
  }

  // ---------- 详情 ----------
  const detailVisible = ref(false)
  const detailLoading = ref(false)
  const detail = ref<ConversationDetail | null>(null)

  const openDetail = async (row: ConversationItem) => {
    detailVisible.value = true
    detail.value = null
    detailLoading.value = true
    try {
      detail.value = await fetchGetConversationDetail(row.id)
    } finally {
      detailLoading.value = false
    }
  }

  onMounted(loadData)
</script>
