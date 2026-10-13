<!-- SaaS 租户管理 -->
<template>
  <div class="art-full-height">
    <!-- 搜索栏 -->
    <ElCard class="mb-3" shadow="never">
      <ElForm :model="searchForm" inline>
        <ElFormItem label="关键词">
          <ElInput
            v-model="searchForm.keyword"
            placeholder="名称 / 编码"
            clearable
            style="width: 200px"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="searchForm.status" placeholder="全部" clearable style="width: 120px">
            <ElOption label="启用" value="ENABLED" />
            <ElOption label="禁用" value="DISABLED" />
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
        <ElButton type="primary" @click="openDialog('add')" v-auth="'saas:tenant:create'" v-ripple>
          新增租户
        </ElButton>
        <ElButton circle @click="loadData" v-ripple>
          <ElIcon><Refresh /></ElIcon>
        </ElButton>
      </div>

      <ElTable :data="list" v-loading="loading" row-key="id" stripe>
        <ElTableColumn prop="name" label="租户名称" min-width="140" />
        <ElTableColumn prop="code" label="编码" min-width="120">
          <template #default="{ row }">
            <ElTag size="small" type="info">{{ row.code }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="contactName" label="联系人" min-width="100">
          <template #default="{ row }">{{ row.contactName ?? '-' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="contactEmail" label="联系邮箱" min-width="160">
          <template #default="{ row }">{{ row.contactEmail ?? '-' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="状态" width="90">
          <template #default="{ row }">
            <ElTag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
              {{ row.status === 'ENABLED' ? '启用' : '禁用' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="conversationCount" label="会话数" width="90" align="center" />
        <ElTableColumn prop="apiKeyCount" label="Key 数" width="80" align="center" />
        <ElTableColumn prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="primary"
              @click="openDialog('edit', row)"
              v-auth="'saas:tenant:update'"
              >编辑</ElButton
            >
            <ElButton link type="primary" @click="openApiKeys(row)" v-auth="'saas:apikey:list'"
              >API Key</ElButton
            >
            <ElButton
              link
              :type="row.status === 'ENABLED' ? 'warning' : 'success'"
              @click="toggleStatus(row)"
              v-auth="'saas:tenant:update'"
              >{{ row.status === 'ENABLED' ? '禁用' : '启用' }}</ElButton
            >
            <ElButton link type="danger" @click="handleDelete(row)" v-auth="'saas:tenant:delete'"
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
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadData"
          @size-change="loadData"
        />
      </div>
    </ElCard>

    <!-- 新增/编辑租户 -->
    <ElDialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增租户' : '编辑租户'"
      width="480px"
    >
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <ElFormItem label="租户名称" prop="name">
          <ElInput v-model="form.name" placeholder="如：星辰电商" />
        </ElFormItem>
        <ElFormItem label="租户编码" prop="code">
          <ElInput
            v-model="form.code"
            :disabled="dialogType === 'edit'"
            placeholder="全局唯一，小写字母/数字/中划线"
          />
        </ElFormItem>
        <ElFormItem label="联系人">
          <ElInput v-model="form.contactName" />
        </ElFormItem>
        <ElFormItem label="联系邮箱">
          <ElInput v-model="form.contactEmail" />
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput v-model="form.remark" type="textarea" :rows="2" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitForm">确定</ElButton>
      </template>
    </ElDialog>

    <!-- API Key 管理 -->
    <ElDialog
      v-model="apiKeyVisible"
      :title="`API Key - ${currentTenant?.name ?? ''}`"
      width="640px"
    >
      <div class="mb-3 flex-cb">
        <ElAlert
          v-if="plaintextKey"
          type="success"
          :closable="false"
          class="flex-1 mr-3"
          title="Key 已创建，请立即复制保存（仅展示一次）"
        >
          <div class="flex-c mt-1">
            <ElInput v-model="plaintextKey" readonly>
              <template #append>
                <ElButton @click="copyPlaintext">复制</ElButton>
              </template>
            </ElInput>
          </div>
          <div class="flex-c mt-2 gap-2">
            <ElInput :model-value="embedCode" readonly size="small" />
            <ElButton size="small" @click="copyEmbedCode">复制挂件代码</ElButton>
          </div>
          <div class="mt-1 text-xs text-g-500">
            把它粘贴到任意网站 &lt;/body&gt; 前即可挂载客服；帮助中心：
            <a
              :href="`${backendOrigin}/help/${currentTenant?.code ?? ''}`"
              target="_blank"
              rel="noopener"
            >
              /help/{{ currentTenant?.code }}
            </a>
          </div>
        </ElAlert>
        <ElButton
          type="primary"
          size="small"
          v-auth="'saas:apikey:create'"
          @click="keyDialogVisible = true"
          >新建 Key</ElButton
        >
      </div>

      <ElTable :data="apiKeyList" v-loading="apiKeyLoading" row-key="id" size="small" stripe>
        <ElTableColumn prop="name" label="名称" min-width="120" />
        <ElTableColumn prop="keyPrefix" label="Key 前缀" min-width="110">
          <template #default="{ row }">
            <ElTag size="small">{{ row.keyPrefix }}…</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="状态" width="80">
          <template #default="{ row }">
            <ElTag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
              {{ row.status === 'ENABLED' ? '启用' : '禁用' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="lastUsedAt" label="最近使用" width="160">
          <template #default="{ row }">{{
            row.lastUsedAt ? formatTime(row.lastUsedAt) : '-'
          }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="80">
          <template #default="{ row }">
            <ElButton link type="danger" @click="handleDeleteKey(row)" v-auth="'saas:apikey:delete'"
              >删除</ElButton
            >
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="text-xs text-g-500 mt-3">
        访问对话接口时通过 X-Api-Key 请求头携带完整 Key，如 POST /api/v1/saas/visitor/chat/stream
      </div>
    </ElDialog>

    <!-- 新建 API Key -->
    <ElDialog v-model="keyDialogVisible" title="新建 API Key" width="400px">
      <ElForm :model="keyForm" label-width="70px">
        <ElFormItem label="名称" required>
          <ElInput v-model="keyForm.name" placeholder="用途备注，如：官网挂件" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="keyDialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitApiKey">创建</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import {
    fetchCreateApiKey,
    fetchCreateTenant,
    fetchDeleteApiKey,
    fetchDeleteTenant,
    fetchGetApiKeyList,
    fetchGetTenantPage,
    fetchUpdateTenant
  } from '@/api/saas'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Refresh } from '@element-plus/icons-vue'

  defineOptions({ name: 'SaasTenant' })

  type TenantItem = Api.Saas.TenantItem
  type ApiKeyItem = Api.Saas.ApiKeyItem

  const loading = ref(false)
  const submitting = ref(false)
  const list = ref<TenantItem[]>([])
  const total = ref(0)
  const query = reactive({ page: 1, pageSize: 20 })
  const searchForm = reactive({ keyword: '', status: undefined as string | undefined })

  const formatTime = (s: string) =>
    s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '-'

  const loadData = async () => {
    loading.value = true
    try {
      const res = await fetchGetTenantPage({
        ...query,
        keyword: searchForm.keyword || undefined,
        status: (searchForm.status as Api.Common.EnableStatus) || undefined
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
    searchForm.keyword = ''
    searchForm.status = undefined
    handleSearch()
  }

  // ---------- 新增/编辑 ----------
  const dialogVisible = ref(false)
  const dialogType = ref<'add' | 'edit'>('add')
  const formRef = ref<FormInstance>()
  const currentId = ref('')
  const form = reactive({
    name: '',
    code: '',
    contactName: '',
    contactEmail: '',
    remark: ''
  })

  const formRules: FormRules = {
    name: [{ required: true, message: '请输入租户名称', trigger: 'blur' }],
    code: [
      { required: true, message: '请输入租户编码', trigger: 'blur' },
      {
        pattern: /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/,
        message: '仅小写字母、数字、中划线，长度 3-32',
        trigger: 'blur'
      }
    ]
  }

  const openDialog = (type: 'add' | 'edit', row?: TenantItem) => {
    dialogType.value = type
    currentId.value = row?.id ?? ''
    Object.assign(form, {
      name: row?.name ?? '',
      code: row?.code ?? '',
      contactName: row?.contactName ?? '',
      contactEmail: row?.contactEmail ?? '',
      remark: row?.remark ?? ''
    })
    dialogVisible.value = true
  }

  const submitForm = async () => {
    await formRef.value?.validate()
    submitting.value = true
    try {
      if (dialogType.value === 'add') {
        await fetchCreateTenant({ ...form })
        ElMessage.success('创建成功')
      } else {
        await fetchUpdateTenant(currentId.value, {
          name: form.name,
          contactName: form.contactName || undefined,
          contactEmail: form.contactEmail || undefined,
          remark: form.remark || undefined
        })
        ElMessage.success('更新成功')
      }
      dialogVisible.value = false
      loadData()
    } finally {
      submitting.value = false
    }
  }

  // ---------- 启停/删除 ----------
  const toggleStatus = async (row: TenantItem) => {
    const target = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
    await ElMessageBox.confirm(
      target === 'DISABLED' ? '禁用后该租户的访客对话将立即失效，确认禁用？' : '确认启用该租户？',
      '提示',
      { type: 'warning' }
    )
    await fetchUpdateTenant(row.id, { status: target })
    ElMessage.success('操作成功')
    loadData()
  }

  const handleDelete = async (row: TenantItem) => {
    await ElMessageBox.confirm(
      `确定删除租户「${row.name}」吗？其下 API Key 将连带失效，历史会话保留。`,
      '警告',
      { type: 'error', confirmButtonText: '删除' }
    )
    await fetchDeleteTenant(row.id)
    ElMessage.success('删除成功')
    loadData()
  }

  // ---------- API Key ----------
  const apiKeyVisible = ref(false)
  const apiKeyLoading = ref(false)
  const apiKeyList = ref<ApiKeyItem[]>([])
  const currentTenant = ref<TenantItem | null>(null)
  const plaintextKey = ref('')
  const keyDialogVisible = ref(false)
  const keyForm = reactive({ name: '' })

  const loadApiKeys = async () => {
    if (!currentTenant.value) return
    apiKeyLoading.value = true
    try {
      apiKeyList.value = await fetchGetApiKeyList(currentTenant.value.id)
    } finally {
      apiKeyLoading.value = false
    }
  }

  const openApiKeys = (row: TenantItem) => {
    currentTenant.value = row
    plaintextKey.value = ''
    apiKeyVisible.value = true
    loadApiKeys()
  }

  const submitApiKey = async () => {
    if (!keyForm.name.trim()) {
      ElMessage.warning('请输入 Key 名称')
      return
    }
    submitting.value = true
    try {
      const created = await fetchCreateApiKey(currentTenant.value!.id, keyForm.name.trim())
      plaintextKey.value = created.plaintext ?? ''
      keyForm.name = ''
      keyDialogVisible.value = false
      loadApiKeys()
      loadData()
    } finally {
      submitting.value = false
    }
  }

  const copyPlaintext = async () => {
    await navigator.clipboard.writeText(plaintextKey.value)
    ElMessage.success('已复制')
  }

  // 挂件代码：开发态指向代理的后端源（VITE_API_PROXY_URL），生产默认同源
  const backendOrigin = import.meta.env.VITE_API_PROXY_URL || window.location.origin
  const embedCode = computed(
    () => `<script src="${backendOrigin}/widget.js?k=${plaintextKey.value}">` + '</scr' + 'ipt>'
  )
  const copyEmbedCode = async () => {
    await navigator.clipboard.writeText(embedCode.value)
    ElMessage.success('挂件代码已复制，粘贴到目标网站 </body> 前即可')
  }

  const handleDeleteKey = async (row: ApiKeyItem) => {
    await ElMessageBox.confirm(
      `确定删除 Key「${row.name}」吗？删除后使用该 Key 的接入将立即失效。`,
      '警告',
      {
        type: 'error',
        confirmButtonText: '删除'
      }
    )
    await fetchDeleteApiKey(row.id)
    ElMessage.success('删除成功')
    loadApiKeys()
    loadData()
  }

  onMounted(loadData)
</script>
