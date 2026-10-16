<template>
  <div class="art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <div class="flex-cb mb-3">
        <span class="page-desc"
          >配置 LLM provider，评审任务执行时按此下发（API Key 加密存储，不回传）</span
        >
        <ElButton
          type="primary"
          @click="openDialog('add')"
          v-auth="PermissionCode.ReviewModelCreate"
          v-ripple
        >
          <ElIcon class="mr-1"><Plus /></ElIcon>新增模型
        </ElButton>
      </div>

      <ElTable :data="list" v-loading="loading" row-key="id" stripe>
        <ElTableColumn prop="name" label="名称" min-width="130">
          <template #default="{ row }">
            <span class="model-name">{{ row.name }}</span>
            <ElTag v-if="row.isDefault" type="success" size="small" class="ml-1">默认</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="provider" label="Provider" width="120" />
        <ElTableColumn label="协议" width="150">
          <template #default="{ row }">
            <ElTag size="small" effect="plain">{{ row.protocol }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="model" label="模型标识" min-width="150" show-overflow-tooltip />
        <ElTableColumn prop="baseUrl" label="Endpoint" min-width="200" show-overflow-tooltip>
          <template #default="{ row }"
            ><span class="base-url">{{ row.baseUrl }}</span></template
          >
        </ElTableColumn>
        <ElTableColumn label="Key" width="80">
          <template #default="{ row }">
            <ElTag :type="row.hasApiKey ? 'success' : 'danger'" size="small" effect="plain">
              {{ row.hasApiKey ? '已配' : '缺失' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="primary"
              :loading="row._testing"
              @click="handleTest(row)"
              v-auth="PermissionCode.ReviewModelTest"
              >测连</ElButton
            >
            <ElButton
              v-if="!row.isDefault"
              link
              @click="handleSetDefault(row)"
              v-auth="PermissionCode.ReviewModelEdit"
              >设默认</ElButton
            >
            <ElButton
              link
              type="primary"
              @click="openDialog('edit', row)"
              v-auth="PermissionCode.ReviewModelEdit"
              >编辑</ElButton
            >
            <ElButton
              link
              type="danger"
              @click="handleDelete(row)"
              v-auth="PermissionCode.ReviewModelDelete"
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
          layout="total, prev, pager, next"
          @current-change="loadData"
        />
      </div>
    </ElCard>

    <ElDialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增模型' : '编辑模型'"
      width="560px"
    >
      <ElForm ref="formRef" :model="form" :rules="rules" label-width="110px">
        <ElFormItem label="显示名" prop="name">
          <ElInput v-model="form.name" placeholder="如 MiMo Flash" />
        </ElFormItem>
        <ElFormItem label="Provider" prop="provider">
          <ElSelect v-model="form.provider" style="width: 100%" @change="onProviderChange">
            <ElOption
              v-for="p in providerPresets"
              :key="p.value"
              :label="p.label"
              :value="p.value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="协议" prop="protocol">
          <ElRadioGroup v-model="form.protocol">
            <ElRadioButton value="openai">OpenAI 兼容</ElRadioButton>
            <ElRadioButton value="anthropic">Anthropic</ElRadioButton>
            <ElRadioButton value="openai-responses">OpenAI Responses</ElRadioButton>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="Endpoint" prop="baseUrl">
          <ElInput v-model="form.baseUrl" placeholder="https://api.example.com/v1" />
        </ElFormItem>
        <ElFormItem label="API Key" :prop="dialogType === 'add' ? 'apiKey' : ''">
          <ElInput
            v-model="form.apiKey"
            type="password"
            show-password
            :placeholder="dialogType === 'edit' ? '留空保持不变' : ''"
          />
        </ElFormItem>
        <ElFormItem label="模型标识" prop="model">
          <ElInput v-model="form.model" placeholder="如 qwen-max / deepseek-chat" />
        </ElFormItem>
        <ElFormItem label="额外请求体">
          <ElInput
            v-model="extraBodyText"
            type="textarea"
            :rows="3"
            placeholder='可选 JSON，如 {"thinking":{"type":"enabled"}}'
            @blur="validateExtraBody"
          />
          <div v-if="extraBodyError" class="form-error">{{ extraBodyError }}</div>
        </ElFormItem>
        <ElFormItem label="设为默认">
          <ElSwitch v-model="form.isDefault" />
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

  defineOptions({ name: 'ReviewModel' })

  type ModelRow = Api.Review.ModelItem & { _testing?: boolean }

  const providerPresets = [
    { label: '自定义（OpenAI 兼容）', value: 'openai', protocol: 'openai' },
    { label: '阿里百炼 DashScope', value: 'dashscope', protocol: 'openai' },
    { label: 'DeepSeek', value: 'deepseek', protocol: 'openai' },
    { label: '火山方舟 VolcEngine', value: 'volcengine', protocol: 'openai' },
    { label: 'Anthropic Claude', value: 'anthropic', protocol: 'anthropic' },
    { label: 'OpenRouter', value: 'openrouter', protocol: 'openai' }
  ]

  const loading = ref(false)
  const submitting = ref(false)
  const list = ref<ModelRow[]>([])
  const total = ref(0)
  const query = reactive({ page: 1, pageSize: 20 })

  const dialogVisible = ref(false)
  const dialogType = ref<'add' | 'edit'>('add')
  const formRef = ref()
  const form = reactive({
    id: '',
    name: '',
    provider: 'openai',
    protocol: 'openai',
    baseUrl: '',
    apiKey: '',
    model: '',
    isDefault: false
  })
  const extraBodyText = ref('')
  const extraBodyError = ref('')

  const rules = {
    name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
    provider: [{ required: true, message: '请选择 provider', trigger: 'change' }],
    protocol: [{ required: true, message: '请选择协议', trigger: 'change' }],
    baseUrl: [{ required: true, message: '请输入 endpoint', trigger: 'blur' }],
    apiKey: [{ required: true, message: '请输入 API Key', trigger: 'blur' }],
    model: [{ required: true, message: '请输入模型标识', trigger: 'blur' }]
  }

  async function loadData(): Promise<void> {
    loading.value = true
    try {
      const res = await reviewApi.fetchModels(query)
      list.value = res.list
      total.value = res.total
    } finally {
      loading.value = false
    }
  }

  function onProviderChange(provider: string): void {
    const preset = providerPresets.find((p) => p.value === provider)
    if (preset) form.protocol = preset.protocol
  }

  function openDialog(type: 'add' | 'edit', row?: ModelRow): void {
    dialogType.value = type
    extraBodyError.value = ''
    if (type === 'edit' && row) {
      Object.assign(form, {
        id: row.id,
        name: row.name,
        provider: row.provider,
        protocol: row.protocol,
        baseUrl: row.baseUrl,
        apiKey: '',
        model: row.model,
        isDefault: row.isDefault
      })
      extraBodyText.value = row.extraBody ? JSON.stringify(row.extraBody, null, 2) : ''
    } else {
      Object.assign(form, {
        id: '',
        name: '',
        provider: 'openai',
        protocol: 'openai',
        baseUrl: '',
        apiKey: '',
        model: '',
        isDefault: false
      })
      extraBodyText.value = ''
    }
    dialogVisible.value = true
  }

  function validateExtraBody(): void {
    extraBodyError.value = ''
    if (!extraBodyText.value.trim()) return
    try {
      JSON.parse(extraBodyText.value)
    } catch {
      extraBodyError.value = 'JSON 格式错误'
    }
  }

  async function submitForm(): Promise<void> {
    await formRef.value?.validate()
    validateExtraBody()
    if (extraBodyError.value) return
    submitting.value = true
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        provider: form.provider,
        protocol: form.protocol,
        baseUrl: form.baseUrl,
        model: form.model,
        isDefault: form.isDefault,
        ...(form.apiKey && { apiKey: form.apiKey }),
        ...(extraBodyText.value.trim() && { extraBody: JSON.parse(extraBodyText.value) })
      }
      if (dialogType.value === 'add') {
        await reviewApi.createModel(payload)
        ElMessage.success('已新增，可点击「测连」验证')
      } else {
        await reviewApi.updateModel(form.id, payload)
        ElMessage.success('已更新')
      }
      dialogVisible.value = false
      void loadData()
    } finally {
      submitting.value = false
    }
  }

  async function handleTest(row: ModelRow): Promise<void> {
    row._testing = true
    try {
      const r = await reviewApi.testModel(row.id)
      ElMessage[r.ok ? 'success' : 'error'](r.message)
    } finally {
      row._testing = false
    }
  }

  async function handleSetDefault(row: ModelRow): Promise<void> {
    await reviewApi.updateModel(row.id, { isDefault: true })
    ElMessage.success('已设为默认')
    void loadData()
  }

  async function handleDelete(row: ModelRow): Promise<void> {
    await ElMessageBox.confirm(`确认删除模型「${row.name}」？`, '删除', { type: 'warning' })
    await reviewApi.deleteModel(row.id)
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

  .model-name {
    font-weight: 600;
  }

  .base-url {
    font-family: monospace;
    font-size: 12px;
  }

  .form-error {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-color-danger);
  }
</style>
