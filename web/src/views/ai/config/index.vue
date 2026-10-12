<!-- AI 模型配置：供应商/模型自定义（参考 CC Switch） -->
<template>
  <div class="art-full-height">
    <ElCard class="mb-3" shadow="never">
      <div class="flex flex-wrap items-center gap-4 text-sm text-g-600">
        <span>
          供应商决定「连哪里、用什么协议」，模型决定「调哪个模型、最大输出与上下文」。
          保存后即时生效，无需重启后端。
        </span>
      </div>
    </ElCard>

    <ElCard class="art-table-card" shadow="never">
      <div class="flex-cb mb-4">
        <ElButton type="primary" @click="openDialog()" v-auth="'ai:config:create'" v-ripple>
          新增供应商
        </ElButton>
        <ElButton circle @click="loadData" v-ripple>
          <ElIcon><Refresh /></ElIcon>
        </ElButton>
      </div>

      <div v-loading="loading" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="p in providers"
          :key="p.id"
          class="flex flex-col rounded-lg border border-g-200 p-4 transition-shadow hover:shadow-md"
          :class="{ 'opacity-60': !p.enabled }"
        >
          <div class="flex-cb mb-2">
            <div class="flex items-center gap-2">
              <span class="text-base font-medium">{{ p.name }}</span>
              <ElTag size="small" :type="p.protocol === 'OLLAMA' ? 'warning' : 'primary'">
                {{ protocolLabel(p.protocol) }}
              </ElTag>
              <ElTag v-if="!p.enabled" size="small" type="info">已停用</ElTag>
            </div>
            <ElSwitch
              :model-value="p.enabled"
              v-auth="'ai:config:update'"
              @change="(v) => toggleEnabled(p, Boolean(v))"
            />
          </div>

          <div class="mb-3 truncate text-xs text-g-500" :title="p.baseUrl">{{ p.baseUrl }}</div>

          <div class="mb-3 flex flex-wrap gap-1.5">
            <ElTooltip
              v-for="m in p.models"
              :key="m.id ?? m.name"
              :content="modelTip(m)"
              placement="top"
            >
              <ElTag size="small" :type="m.isDefault ? 'success' : 'info'" effect="plain">
                {{ m.label || m.name }}
                <span v-if="m.isDefault" class="ml-0.5">★</span>
              </ElTag>
            </ElTooltip>
            <span v-if="!p.models.length" class="text-xs text-g-400">未配置模型</span>
          </div>

          <div v-if="p.remark" class="mb-3 line-clamp-2 text-xs text-g-500">{{ p.remark }}</div>

          <div class="mt-auto flex justify-end gap-2">
            <ElButton
              link
              type="primary"
              size="small"
              @click="openDialog(p)"
              v-auth="'ai:config:update'"
              >编辑</ElButton
            >
            <ElButton
              link
              type="danger"
              size="small"
              @click="handleDelete(p)"
              v-auth="'ai:config:delete'"
              >删除</ElButton
            >
          </div>
        </div>

        <div
          v-if="!loading && !providers.length"
          class="col-span-full flex flex-col items-center justify-center gap-3 py-16 text-g-400"
        >
          <ArtSvgIcon icon="ri:server-line" class="text-[42px]" />
          <span class="text-sm">还没有供应商配置，点击「新增供应商」开始</span>
        </div>
      </div>
    </ElCard>

    <!-- 新增/编辑供应商 -->
    <ElDialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增供应商' : `编辑：${form.name}`"
      width="760px"
      top="6vh"
    >
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="96px">
        <!-- 预设快捷填充（参考 CC Switch「选预设」） -->
        <ElFormItem label="常用预设">
          <div class="flex flex-wrap gap-2">
            <ElButton
              v-for="preset in PRESETS"
              :key="preset.key"
              size="small"
              plain
              @click="applyPreset(preset)"
            >
              {{ preset.name }}
            </ElButton>
          </div>
        </ElFormItem>

        <ElFormItem label="供应商名称" prop="name">
          <ElInput v-model="form.name" placeholder="如 DeepSeek、公司网关" maxlength="64" />
        </ElFormItem>
        <ElFormItem label="协议格式" prop="protocol">
          <ElSelect v-model="form.protocol" style="width: 100%">
            <ElOption label="OpenAI 兼容（Chat Completions）" value="OPENAI_COMPAT" />
            <ElOption label="Ollama（本地原生 API）" value="OLLAMA" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="端点地址" prop="baseUrl">
          <ElInput
            v-model="form.baseUrl"
            placeholder="OpenAI 兼容通常以 /v1 结尾；Ollama 如 http://localhost:11434"
          />
        </ElFormItem>
        <ElFormItem label="API Key">
          <ElInput
            v-model="form.apiKey"
            type="password"
            show-password
            clearable
            :placeholder="
              editing?.apiKey ? `未修改（当前 ${editing.apiKey}）` : '本地/免鉴权服务可留空'
            "
          />
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput v-model="form.remark" maxlength="255" />
        </ElFormItem>

        <ElFormItem label="模型列表">
          <div class="w-full">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <ElButton size="small" @click="addModel">添加模型</ElButton>
              <ElSelect
                v-model="pickedRemoteModel"
                filterable
                clearable
                placeholder="选择要添加的远程模型…"
                style="width: 240px"
                v-if="remoteModels.length"
              >
                <ElOption v-for="id in remoteModels" :key="id" :label="id" :value="id" />
              </ElSelect>
              <ElButton
                size="small"
                :loading="fetching"
                @click="handleFetchModels"
                :disabled="!form.baseUrl"
              >
                获取模型列表
              </ElButton>
              <span class="text-xs text-g-400">从端点拉取 /v1/models</span>
            </div>

            <div
              v-for="(m, i) in form.models"
              :key="i"
              class="mb-2 rounded-md border border-g-200 p-3"
            >
              <div class="flex flex-wrap items-end gap-2">
                <div class="min-w-40 flex-1">
                  <div class="mb-1 text-xs text-g-500">模型 ID *</div>
                  <ElInput v-model="m.name" placeholder="如 deepseek-chat" />
                </div>
                <div class="min-w-32 flex-1">
                  <div class="mb-1 text-xs text-g-500">显示名</div>
                  <ElInput v-model="m.label" placeholder="下拉展示用" />
                </div>
                <div class="w-28">
                  <div class="mb-1 text-xs text-g-500">最大输出</div>
                  <ElInputNumber
                    v-model="m.maxOutput"
                    :min="1"
                    :max="1000000"
                    controls-position="right"
                    class="!w-full"
                    placeholder="tokens"
                  />
                </div>
                <div class="w-32">
                  <div class="mb-1 text-xs text-g-500">上下文窗口</div>
                  <ElInputNumber
                    v-model="m.contextWindow"
                    :min="1"
                    :max="100000000"
                    controls-position="right"
                    class="!w-full"
                    placeholder="tokens"
                  />
                </div>
                <div class="flex items-center gap-1 pb-1">
                  <ElRadio
                    :model-value="m.isDefault ?? false"
                    :value="true"
                    @change="setDefault(i)"
                  >
                    默认
                  </ElRadio>
                  <ElSwitch
                    :model-value="m.enabled ?? true"
                    @change="(v) => (m.enabled = Boolean(v))"
                  />
                  <ElButton link type="danger" :icon="Delete" @click="form.models.splice(i, 1)" />
                </div>
              </div>
            </div>
            <div v-if="!form.models.length" class="py-2 text-xs text-g-400">
              暂无模型，可手动添加或点「获取模型列表」
            </div>
          </div>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitForm">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import {
    fetchAiProviders,
    fetchCreateAiProvider,
    fetchDeleteAiProvider,
    fetchRemoteModels,
    fetchUpdateAiProvider
  } from '@/api/ai-config'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Delete, Refresh } from '@element-plus/icons-vue'

  defineOptions({ name: 'AiConfig' })

  type ProviderItem = Api.AiConfig.ProviderItem
  type ModelItem = Api.AiConfig.ModelItem
  type Protocol = Api.AiConfig.Protocol

  /** 预设（与后端 PROVIDER_BASE_URLS 对应，仅作表单快捷填充） */
  const PRESETS: { key: string; name: string; baseUrl: string; protocol: Protocol }[] = [
    {
      key: 'openai',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      protocol: 'OPENAI_COMPAT'
    },
    {
      key: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      protocol: 'OPENAI_COMPAT'
    },
    {
      key: 'qwen',
      name: '通义千问',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      protocol: 'OPENAI_COMPAT'
    },
    {
      key: 'zhipu',
      name: '智谱 AI',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      protocol: 'OPENAI_COMPAT'
    },
    {
      key: 'moonshot',
      name: 'Kimi',
      baseUrl: 'https://api.moonshot.cn/v1',
      protocol: 'OPENAI_COMPAT'
    },
    {
      key: 'mimo',
      name: 'Xiaomi MiMo',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      protocol: 'OPENAI_COMPAT'
    },
    { key: 'ollama', name: 'Ollama（本地）', baseUrl: 'http://localhost:11434', protocol: 'OLLAMA' }
  ]

  const protocolLabel = (p: Protocol) => (p === 'OLLAMA' ? 'Ollama' : 'OpenAI 兼容')
  const modelTip = (m: ModelItem) =>
    [
      m.name,
      m.maxOutput ? `最大输出 ${m.maxOutput}` : null,
      m.contextWindow ? `上下文 ${m.contextWindow}` : null,
      m.enabled === false ? '已停用' : null
    ]
      .filter(Boolean)
      .join(' · ')

  const loading = ref(false)
  const providers = ref<ProviderItem[]>([])

  const loadData = async () => {
    loading.value = true
    try {
      providers.value = await fetchAiProviders()
    } finally {
      loading.value = false
    }
  }

  // ---------- 表单 ----------
  const dialogVisible = ref(false)
  const dialogType = ref<'add' | 'edit'>('add')
  const submitting = ref(false)
  const formRef = ref<FormInstance>()
  const editing = ref<ProviderItem | null>(null)

  const blankForm = () => ({
    name: '',
    protocol: 'OPENAI_COMPAT' as Protocol,
    baseUrl: '',
    apiKey: '',
    remark: '',
    models: [] as ModelItem[]
  })
  const form = reactive(blankForm())

  const formRules: FormRules = {
    name: [{ required: true, message: '请输入供应商名称', trigger: 'blur' }],
    protocol: [{ required: true, message: '请选择协议格式', trigger: 'change' }],
    baseUrl: [{ required: true, message: '请输入端点地址', trigger: 'blur' }]
  }

  const openDialog = (p?: ProviderItem) => {
    dialogType.value = p ? 'edit' : 'add'
    editing.value = p ?? null
    Object.assign(form, blankForm())
    remoteModels.value = []
    pickedRemoteModel.value = ''
    if (p) {
      form.name = p.name
      form.protocol = p.protocol
      form.baseUrl = p.baseUrl
      form.apiKey = ''
      form.remark = p.remark ?? ''
      form.models = p.models.map((m) => ({ ...m }))
    }
    dialogVisible.value = true
    nextTick(() => formRef.value?.clearValidate())
  }

  const applyPreset = (preset: { name: string; baseUrl: string; protocol: Protocol }) => {
    if (form.name && form.name !== preset.name) return
    form.name = preset.name
    form.baseUrl = preset.baseUrl
    form.protocol = preset.protocol
  }

  const addModel = () => {
    form.models.push({ name: '', label: '', enabled: true, isDefault: form.models.length === 0 })
  }

  /** 默认模型全局唯一：选中第 i 个后清掉其他 */
  const setDefault = (index: number) => {
    form.models.forEach((m, i) => (m.isDefault = i === index))
  }

  // ---------- 获取模型列表 ----------
  const fetching = ref(false)
  const remoteModels = ref<string[]>([])
  const pickedRemoteModel = ref('')

  const handleFetchModels = async () => {
    if (!form.baseUrl) return ElMessage.warning('先填写端点地址')
    fetching.value = true
    try {
      const res = await fetchRemoteModels({
        baseUrl: form.baseUrl,
        apiKey: form.apiKey || undefined,
        protocol: form.protocol
      })
      remoteModels.value = res.ids
      if (!res.ids.length) ElMessage.info('端点未返回模型，请手动填写模型 ID')
    } finally {
      fetching.value = false
    }
  }

  // pickedRemoteModel 选中即添加为模型行
  watch(pickedRemoteModel, (v) => {
    if (!v) return
    if (form.models.some((m) => m.name === v)) {
      ElMessage.info('该模型已在列表中')
      pickedRemoteModel.value = ''
      return
    }
    form.models.push({ name: v, label: v, enabled: true, isDefault: form.models.length === 0 })
    pickedRemoteModel.value = ''
  })

  // ---------- 提交 ----------
  const submitForm = async () => {
    await formRef.value?.validate()

    const names = form.models.map((m) => m.name.trim()).filter(Boolean)
    if (names.length !== form.models.length) return ElMessage.warning('模型 ID 不能为空')
    if (new Set(names).size !== names.length) return ElMessage.warning('模型 ID 不能重复')

    const payload: Api.AiConfig.ProviderPayload = {
      name: form.name,
      protocol: form.protocol,
      baseUrl: form.baseUrl,
      remark: form.remark || undefined,
      models: form.models.map((m, i) => ({
        ...m,
        name: m.name.trim(),
        maxOutput: m.maxOutput ?? undefined,
        contextWindow: m.contextWindow ?? undefined,
        sort: i
      }))
    }
    // 新密钥才提交；留空保留数据库原值（后端对掩码回传也做了保护）
    if (form.apiKey) payload.apiKey = form.apiKey

    submitting.value = true
    try {
      if (dialogType.value === 'add') {
        await fetchCreateAiProvider(payload)
        ElMessage.success('供应商已创建')
      } else {
        await fetchUpdateAiProvider(editing.value!.id, payload)
        ElMessage.success('已保存，下次调用即时生效')
      }
      dialogVisible.value = false
      loadData()
    } finally {
      submitting.value = false
    }
  }

  const toggleEnabled = async (p: ProviderItem, v: boolean) => {
    await fetchUpdateAiProvider(p.id, { enabled: v })
    p.enabled = v
    ElMessage.success(v ? '已启用' : '已停用')
  }

  const handleDelete = async (p: ProviderItem) => {
    await ElMessageBox.confirm(
      `删除供应商「${p.name}」后，其模型将不再出现在对话选择器中；对话将回落到环境默认配置。确认删除？`,
      '删除供应商',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    await fetchDeleteAiProvider(p.id)
    ElMessage.success('已删除')
    loadData()
  }

  onMounted(loadData)
</script>
