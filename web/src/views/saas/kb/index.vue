<!-- SaaS 知识库：库列表 ↔ 库内文章（页内切换），含标签管理与文章编辑 -->
<template>
  <div class="art-full-height">
    <!-- ==================== 库列表视图 ==================== -->
    <template v-if="!currentKb">
      <ElCard class="mb-3" shadow="never">
        <ElForm inline>
          <ElFormItem label="关键词">
            <ElInput
              v-model="kbSearch.keyword"
              placeholder="知识库名称"
              clearable
              style="width: 200px"
              @keyup.enter="searchKbs"
            />
          </ElFormItem>
          <ElFormItem>
            <ElButton type="primary" @click="searchKbs" v-ripple>搜索</ElButton>
            <ElButton @click="resetKbSearch" v-ripple>重置</ElButton>
          </ElFormItem>
        </ElForm>
      </ElCard>

      <ElCard class="art-table-card" shadow="never">
        <div class="flex-cb mb-3">
          <ElButton type="primary" @click="openKbDialog('add')" v-auth="'saas:kb:create'" v-ripple>
            新建知识库
          </ElButton>
          <ElButton circle @click="loadKbs" v-ripple>
            <ElIcon><Refresh /></ElIcon>
          </ElButton>
        </div>

        <ElTable :data="kbList" v-loading="kbLoading" row-key="id" stripe>
          <ElTableColumn prop="name" label="名称" min-width="160" />
          <ElTableColumn prop="tenantName" label="租户" min-width="120">
            <template #default="{ row }">{{ row.tenantName ?? '-' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="description" label="说明" min-width="200">
            <template #default="{ row }">{{ row.description ?? '-' }}</template>
          </ElTableColumn>
          <ElTableColumn label="文章" width="120" align="center">
            <template #default="{ row }">
              {{ row.publishedCount }} / {{ row.articleCount }} 已发布
            </template>
          </ElTableColumn>
          <ElTableColumn prop="status" label="状态" width="90">
            <template #default="{ row }">
              <ElTag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
                {{ row.status === 'ENABLED' ? '启用' : '禁用' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <ElButton
                link
                type="primary"
                @click="enterArticles(row)"
                v-auth="'saas:kb:article:list'"
                >文章</ElButton
              >
              <ElButton link type="primary" @click="openTagDialog(row)" v-auth="'saas:kb:tag:list'"
                >标签</ElButton
              >
              <ElButton
                link
                type="primary"
                @click="openKbDialog('edit', row)"
                v-auth="'saas:kb:update'"
                >编辑</ElButton
              >
              <ElButton link type="danger" @click="handleDeleteKb(row)" v-auth="'saas:kb:delete'"
                >删除</ElButton
              >
            </template>
          </ElTableColumn>
        </ElTable>

        <div class="flex justify-end mt-4">
          <ElPagination
            v-model:current-page="kbQuery.page"
            v-model:page-size="kbQuery.pageSize"
            :total="kbTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="loadKbs"
            @size-change="loadKbs"
          />
        </div>
      </ElCard>
    </template>

    <!-- ==================== 文章列表视图 ==================== -->
    <template v-else>
      <ElCard class="art-table-card" shadow="never">
        <div class="mb-3 flex-cb">
          <div class="flex items-center gap-2">
            <ElButton @click="backToKbs" v-ripple>← 返回</ElButton>
            <span class="text-base font-semibold">{{ currentKb.name }}</span>
            <ElTag size="small" type="info">{{ currentKb.tenantName ?? '-' }}</ElTag>
          </div>
          <ElButton
            type="primary"
            @click="openArticleDialog('add')"
            v-auth="'saas:kb:article:create'"
            v-ripple
            >写文章</ElButton
          >
        </div>

        <ElForm inline class="mb-3">
          <ElFormItem label="标题">
            <ElInput
              v-model="articleSearch.keyword"
              placeholder="文章标题"
              clearable
              style="width: 180px"
              @keyup.enter="searchArticles"
            />
          </ElFormItem>
          <ElFormItem label="状态">
            <ElSelect
              v-model="articleSearch.status"
              placeholder="全部"
              clearable
              style="width: 120px"
            >
              <ElOption label="草稿" value="DRAFT" />
              <ElOption label="已发布" value="PUBLISHED" />
              <ElOption label="已归档" value="ARCHIVED" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="标签">
            <ElSelect
              v-model="articleSearch.tagId"
              placeholder="全部"
              clearable
              style="width: 140px"
            >
              <ElOption v-for="t in tagOptions" :key="t.id" :label="t.name" :value="t.id" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem>
            <ElButton type="primary" @click="searchArticles" v-ripple>搜索</ElButton>
          </ElFormItem>
        </ElForm>

        <ElTable :data="articleList" v-loading="articleLoading" row-key="id" stripe>
          <ElTableColumn prop="title" label="标题" min-width="220" />
          <ElTableColumn prop="slug" label="slug" min-width="140">
            <template #default="{ row }">
              <ElTag size="small" type="info">{{ row.slug }}</ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="标签" min-width="140">
            <template #default="{ row }">
              <ElTag v-for="t in row.tags" :key="t.id" size="small" class="mr-1">{{
                t.name
              }}</ElTag>
              <span v-if="!row.tags.length">-</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="status" label="状态" width="90">
            <template #default="{ row }">
              <ElTag :type="articleStatusType(row.status)" size="small">
                {{ articleStatusText(row.status) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="viewCount" label="浏览" width="80" align="center" />
          <ElTableColumn prop="updatedAt" label="更新时间" width="170">
            <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <ElButton
                link
                type="primary"
                @click="openArticleDialog('edit', row)"
                v-auth="'saas:kb:article:update'"
                >编辑</ElButton
              >
              <ElButton
                v-if="row.status !== 'PUBLISHED'"
                link
                type="success"
                @click="quickPublish(row)"
                v-auth="'saas:kb:article:update'"
                >发布</ElButton
              >
              <ElButton
                v-else
                link
                type="warning"
                @click="quickUnpublish(row)"
                v-auth="'saas:kb:article:update'"
                >下线</ElButton
              >
              <ElButton
                link
                type="danger"
                @click="handleDeleteArticle(row)"
                v-auth="'saas:kb:article:delete'"
                >删除</ElButton
              >
            </template>
          </ElTableColumn>
        </ElTable>

        <div class="flex justify-end mt-4">
          <ElPagination
            v-model:current-page="articleQuery.page"
            v-model:page-size="articleQuery.pageSize"
            :total="articleTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="loadArticles"
            @size-change="loadArticles"
          />
        </div>
      </ElCard>
    </template>

    <!-- ==================== 知识库弹窗 ==================== -->
    <ElDialog
      v-model="kbDialogVisible"
      :title="kbDialogType === 'add' ? '新建知识库' : '编辑知识库'"
      width="480px"
    >
      <ElForm ref="kbFormRef" :model="kbForm" :rules="kbFormRules" label-width="80px">
        <ElFormItem v-if="kbDialogType === 'add'" label="租户" prop="tenantId">
          <ElSelect v-model="kbForm.tenantId" placeholder="选择租户" style="width: 100%">
            <ElOption v-for="t in tenantOptions" :key="t.id" :label="t.name" :value="t.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="名称" prop="name">
          <ElInput v-model="kbForm.name" placeholder="如：售后政策库" />
        </ElFormItem>
        <ElFormItem label="说明">
          <ElInput v-model="kbForm.description" type="textarea" :rows="2" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="kbDialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitKb">确定</ElButton>
      </template>
    </ElDialog>

    <!-- ==================== 标签管理弹窗 ==================== -->
    <ElDialog
      v-model="tagDialogVisible"
      :title="`标签管理 - ${currentTagKb?.name ?? ''}`"
      width="520px"
    >
      <div class="mb-3 flex gap-2">
        <ElInput
          v-model="newTagName"
          placeholder="标签名，如：退货"
          maxlength="30"
          style="width: 220px"
          @keyup.enter="submitTag"
        />
        <ElButton
          type="primary"
          :loading="submitting"
          @click="submitTag"
          v-auth="'saas:kb:tag:create'"
          >新增</ElButton
        >
      </div>
      <ElTable :data="tagOptions" v-loading="tagLoading" size="small" row-key="id">
        <ElTableColumn prop="name" label="标签" min-width="120" />
        <ElTableColumn prop="articleCount" label="引用文章" width="90" align="center" />
        <ElTableColumn label="操作" width="80">
          <template #default="{ row }">
            <ElButton link type="danger" @click="handleDeleteTag(row)" v-auth="'saas:kb:tag:delete'"
              >删除</ElButton
            >
          </template>
        </ElTableColumn>
      </ElTable>
    </ElDialog>

    <!-- ==================== 文章编辑抽屉 ==================== -->
    <ElDrawer
      v-model="articleDialogVisible"
      :title="articleDialogType === 'add' ? '写文章' : '编辑文章'"
      size="640px"
    >
      <ElForm
        ref="articleFormRef"
        :model="articleForm"
        :rules="articleFormRules"
        label-width="90px"
      >
        <ElFormItem label="标题" prop="title">
          <ElInput v-model="articleForm.title" maxlength="120" placeholder="文章标题" />
        </ElFormItem>
        <ElFormItem label="slug" prop="slug">
          <ElInput
            v-model="articleForm.slug"
            placeholder="URL 标识，如 return-policy（同库唯一）"
          />
        </ElFormItem>
        <ElFormItem label="标签">
          <ElSelect
            v-model="articleForm.tagIds"
            multiple
            clearable
            placeholder="选择标签"
            style="width: 100%"
          >
            <ElOption v-for="t in tagOptions" :key="t.id" :label="t.name" :value="t.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="状态">
          <ElRadioGroup v-model="articleForm.status">
            <ElRadio value="DRAFT">草稿</ElRadio>
            <ElRadio value="PUBLISHED">发布</ElRadio>
            <ElRadio value="ARCHIVED">归档</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="正文" prop="content">
          <ElInput
            v-model="articleForm.content"
            type="textarea"
            :rows="14"
            placeholder="Markdown 正文；二级标题为「问句」时可获得搜索引擎富摘要（FAQPage）"
          />
        </ElFormItem>
        <ElFormItem label="SEO 标题">
          <ElInput v-model="articleForm.seoTitle" maxlength="120" placeholder="缺省回填文章标题" />
        </ElFormItem>
        <ElFormItem label="SEO 描述">
          <ElInput
            v-model="articleForm.seoDescription"
            type="textarea"
            :rows="2"
            maxlength="300"
            placeholder="缺省取正文摘要，建议 80-120 字"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="articleDialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitArticle">保存</ElButton>
      </template>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import {
    fetchCreateArticle,
    fetchCreateKb,
    fetchCreateKbTag,
    fetchDeleteArticle,
    fetchDeleteKb,
    fetchDeleteKbTag,
    fetchGetArticleDetail,
    fetchGetArticlePage,
    fetchGetKbPage,
    fetchGetKbTags,
    fetchGetTenantPage,
    fetchUpdateArticle,
    fetchUpdateKb
  } from '@/api/saas'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Refresh } from '@element-plus/icons-vue'

  defineOptions({ name: 'SaasKb' })

  type KbItem = Api.Saas.KbItem
  type ArticleItem = Api.Saas.ArticleItem
  type KbTag = Api.Saas.KbTag

  const formatTime = (s: string) =>
    s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '-'

  const submitting = ref(false)
  const currentKb = ref<KbItem | null>(null)

  // ==================== 库列表 ====================
  const kbLoading = ref(false)
  const kbList = ref<KbItem[]>([])
  const kbTotal = ref(0)
  const kbQuery = reactive({ page: 1, pageSize: 10 })
  const kbSearch = reactive({ keyword: '' })
  const tenantOptions = ref<{ id: string; name: string }[]>([])

  const loadKbs = async () => {
    kbLoading.value = true
    try {
      const res = await fetchGetKbPage({
        ...kbQuery,
        keyword: kbSearch.keyword || undefined
      })
      kbList.value = res.list
      kbTotal.value = res.total
    } finally {
      kbLoading.value = false
    }
  }

  const searchKbs = () => {
    kbQuery.page = 1
    loadKbs()
  }

  const resetKbSearch = () => {
    kbSearch.keyword = ''
    searchKbs()
  }

  // ---------- 库弹窗 ----------
  const kbDialogVisible = ref(false)
  const kbDialogType = ref<'add' | 'edit'>('add')
  const kbFormRef = ref<FormInstance>()
  const currentKbId = ref('')
  const kbForm = reactive({ tenantId: '', name: '', description: '' })
  const kbFormRules: FormRules = {
    tenantId: [{ required: true, message: '请选择租户', trigger: 'change' }],
    name: [{ required: true, message: '请输入知识库名称', trigger: 'blur' }]
  }

  const openKbDialog = (type: 'add' | 'edit', row?: KbItem) => {
    kbDialogType.value = type
    currentKbId.value = row?.id ?? ''
    Object.assign(kbForm, {
      tenantId: row?.tenantId ?? '',
      name: row?.name ?? '',
      description: row?.description ?? ''
    })
    kbDialogVisible.value = true
  }

  const submitKb = async () => {
    await kbFormRef.value?.validate()
    submitting.value = true
    try {
      if (kbDialogType.value === 'add') {
        await fetchCreateKb({ ...kbForm })
        ElMessage.success('创建成功')
      } else {
        await fetchUpdateKb(currentKbId.value, {
          name: kbForm.name,
          description: kbForm.description
        })
        ElMessage.success('已保存')
      }
      kbDialogVisible.value = false
      loadKbs()
    } finally {
      submitting.value = false
    }
  }

  const handleDeleteKb = async (row: KbItem) => {
    await ElMessageBox.confirm(
      `确定删除知识库「${row.name}」吗？其下文章将不再对外可见。`,
      '警告',
      { type: 'error', confirmButtonText: '删除' }
    )
    await fetchDeleteKb(row.id)
    ElMessage.success('删除成功')
    loadKbs()
  }

  // ==================== 文章列表 ====================
  const articleLoading = ref(false)
  const articleList = ref<ArticleItem[]>([])
  const articleTotal = ref(0)
  const articleQuery = reactive({ page: 1, pageSize: 10 })
  const articleSearch = reactive({
    keyword: '',
    status: undefined as string | undefined,
    tagId: undefined as string | undefined
  })

  const loadArticles = async () => {
    if (!currentKb.value) return
    articleLoading.value = true
    try {
      const res = await fetchGetArticlePage(currentKb.value.id, {
        ...articleQuery,
        keyword: articleSearch.keyword || undefined,
        status: (articleSearch.status as Api.Saas.ArticleStatus) || undefined,
        tagId: articleSearch.tagId || undefined
      })
      articleList.value = res.list
      articleTotal.value = res.total
    } finally {
      articleLoading.value = false
    }
  }

  const searchArticles = () => {
    articleQuery.page = 1
    loadArticles()
  }

  const enterArticles = async (row: KbItem) => {
    currentKb.value = row
    articleQuery.page = 1
    Object.assign(articleSearch, { keyword: '', status: undefined, tagId: undefined })
    await Promise.all([loadArticles(), loadTags(row.id)])
  }

  const backToKbs = () => {
    currentKb.value = null
    loadKbs()
  }

  const articleStatusText = (s: Api.Saas.ArticleStatus) =>
    s === 'PUBLISHED' ? '已发布' : s === 'ARCHIVED' ? '已归档' : '草稿'
  const articleStatusType = (s: Api.Saas.ArticleStatus) =>
    s === 'PUBLISHED' ? 'success' : s === 'ARCHIVED' ? 'info' : 'warning'

  // ---------- 文章弹窗 ----------
  const articleDialogVisible = ref(false)
  const articleDialogType = ref<'add' | 'edit'>('add')
  const articleFormRef = ref<FormInstance>()
  const currentArticleId = ref('')
  const articleForm = reactive({
    title: '',
    slug: '',
    content: '',
    status: 'DRAFT' as Api.Saas.ArticleStatus,
    seoTitle: '',
    seoDescription: '',
    tagIds: [] as string[]
  })
  const articleFormRules: FormRules = {
    title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
    slug: [
      { required: true, message: '请输入 slug', trigger: 'blur' },
      {
        pattern: /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/,
        message: '仅小写字母、数字、中划线，长度 3-60',
        trigger: 'blur'
      }
    ],
    content: [{ required: true, message: '请输入正文', trigger: 'blur' }]
  }

  const openArticleDialog = async (type: 'add' | 'edit', row?: ArticleItem) => {
    if (!currentKb.value) return
    articleDialogType.value = type
    currentArticleId.value = row?.id ?? ''
    if (type === 'add') {
      Object.assign(articleForm, {
        title: '',
        slug: '',
        content: '',
        status: 'DRAFT',
        seoTitle: '',
        seoDescription: '',
        tagIds: []
      })
    } else {
      const detail = await fetchGetArticleDetail(row!.id)
      Object.assign(articleForm, {
        title: detail.title,
        slug: detail.slug,
        content: detail.content,
        status: detail.status,
        seoTitle: detail.seoTitle ?? '',
        seoDescription: detail.seoDescription ?? '',
        tagIds: detail.tags.map((t) => t.id)
      })
    }
    articleDialogVisible.value = true
  }

  const submitArticle = async () => {
    await articleFormRef.value?.validate()
    if (!currentKb.value) return
    submitting.value = true
    try {
      const payload: Api.Saas.ArticlePayload = {
        title: articleForm.title,
        slug: articleForm.slug,
        content: articleForm.content,
        status: articleForm.status,
        seoTitle: articleForm.seoTitle || undefined,
        seoDescription: articleForm.seoDescription || undefined,
        tagIds: articleForm.tagIds
      }
      if (articleDialogType.value === 'add') {
        await fetchCreateArticle(currentKb.value.id, payload)
        ElMessage.success('已创建')
      } else {
        await fetchUpdateArticle(currentArticleId.value, payload)
        ElMessage.success('已保存')
      }
      articleDialogVisible.value = false
      loadArticles()
    } finally {
      submitting.value = false
    }
  }

  const quickPublish = async (row: ArticleItem) => {
    const detail = await fetchGetArticleDetail(row.id)
    await fetchUpdateArticle(row.id, {
      title: detail.title,
      slug: detail.slug,
      content: detail.content,
      status: 'PUBLISHED'
    })
    ElMessage.success('已发布')
    loadArticles()
  }

  const quickUnpublish = async (row: ArticleItem) => {
    const detail = await fetchGetArticleDetail(row.id)
    await fetchUpdateArticle(row.id, {
      title: row.title,
      slug: row.slug,
      content: detail.content,
      status: 'DRAFT'
    })
    ElMessage.success('已下线为草稿')
    loadArticles()
  }

  const handleDeleteArticle = async (row: ArticleItem) => {
    await ElMessageBox.confirm(`确定删除文章「${row.title}」吗？`, '警告', {
      type: 'error',
      confirmButtonText: '删除'
    })
    await fetchDeleteArticle(row.id)
    ElMessage.success('删除成功')
    loadArticles()
    if (currentKb.value) loadKbs()
  }

  // ==================== 标签 ====================
  const tagDialogVisible = ref(false)
  const tagLoading = ref(false)
  const tagOptions = ref<KbTag[]>([])
  const currentTagKb = ref<KbItem | null>(null)
  const newTagName = ref('')

  const loadTags = async (kbId: string) => {
    tagLoading.value = true
    try {
      tagOptions.value = await fetchGetKbTags(kbId)
    } finally {
      tagLoading.value = false
    }
  }

  const openTagDialog = async (row: KbItem) => {
    currentTagKb.value = row
    newTagName.value = ''
    tagDialogVisible.value = true
    await loadTags(row.id)
  }

  const submitTag = async () => {
    const name = newTagName.value.trim()
    if (!name || !currentTagKb.value) {
      ElMessage.warning('请输入标签名')
      return
    }
    submitting.value = true
    try {
      await fetchCreateKbTag(currentTagKb.value.id, name)
      newTagName.value = ''
      loadTags(currentTagKb.value.id)
    } finally {
      submitting.value = false
    }
  }

  const handleDeleteTag = async (row: KbTag) => {
    await ElMessageBox.confirm(`删除标签「${row.name}」将解除其全部文章关联，确认？`, '警告', {
      type: 'error',
      confirmButtonText: '删除'
    })
    await fetchDeleteKbTag(row.id)
    ElMessage.success('删除成功')
    if (currentTagKb.value) loadTags(currentTagKb.value.id)
  }

  onMounted(async () => {
    loadKbs()
    fetchGetTenantPage({ page: 1, pageSize: 100 }).then((res) => {
      tenantOptions.value = res.list.map((t) => ({ id: t.id, name: t.name }))
    })
  })
</script>
