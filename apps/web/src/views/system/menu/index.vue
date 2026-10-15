<!-- 权限点管理（菜单/按钮/接口 统一权限树） -->
<template>
  <div class="art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <div class="flex-cb mb-3">
        <ElButton
          type="primary"
          @click="openDialog('add')"
          v-auth="PermissionCode.SystemPermissionCreate"
          v-ripple
        >
          新增权限点
        </ElButton>
        <ElButton circle @click="loadData" v-ripple>
          <ElIcon><Refresh /></ElIcon>
        </ElButton>
      </div>

      <ElTable
        :data="tree"
        v-loading="loading"
        row-key="id"
        default-expand-all
        :tree-props="{ children: 'children' }"
      >
        <ElTableColumn prop="name" label="名称" min-width="180" />
        <ElTableColumn prop="code" label="权限码" min-width="220">
          <template #default="{ row }">
            <code class="text-xs bg-g-200 rounded px-1.5 py-0.5">{{ row.code }}</code>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="type" label="类型" width="90">
          <template #default="{ row }">
            <ElTag size="small" :type="typeTag(row.type)">{{ typeText(row.type) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="path" label="路由路径" min-width="180">
          <template #default="{ row }">{{ row.path ?? '-' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="icon" label="图标" width="180">
          <template #default="{ row }">{{ row.icon ?? '-' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="sort" label="排序" width="70" />
        <ElTableColumn prop="status" label="状态" width="90">
          <template #default="{ row }">
            <ElTag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
              {{ row.status === 'ENABLED' ? '启用' : '禁用' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <ElButton
              v-if="row.type !== 'BUTTON'"
              link
              type="primary"
              @click="openDialog('add', row)"
              v-auth="PermissionCode.SystemPermissionCreate"
              >新增子级</ElButton
            >
            <ElButton
              link
              type="primary"
              @click="openDialog('edit', row)"
              v-auth="PermissionCode.SystemPermissionUpdate"
              >编辑</ElButton
            >
            <ElButton
              link
              type="danger"
              @click="handleDelete(row)"
              v-auth="PermissionCode.SystemPermissionDelete"
              >删除</ElButton
            >
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <!-- 新增/编辑权限点 -->
    <ElDialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增权限点' : '编辑权限点'"
      width="520px"
    >
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <ElFormItem label="父级">
          <ElTreeSelect
            v-model="form.parentId"
            :data="parentOptions"
            :props="{ label: 'name', value: 'id' }"
            check-strictly
            clearable
            placeholder="留空为根节点"
            style="width: 100%"
          />
        </ElFormItem>
        <ElFormItem label="类型" prop="type">
          <ElRadioGroup v-model="form.type" :disabled="dialogType === 'edit'">
            <ElRadioButton value="DIR">目录</ElRadioButton>
            <ElRadioButton value="MENU">菜单</ElRadioButton>
            <ElRadioButton value="BUTTON">按钮</ElRadioButton>
            <ElRadioButton value="API">接口</ElRadioButton>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="名称" prop="name">
          <ElInput v-model="form.name" placeholder="如：用户管理 / 新增按钮" />
        </ElFormItem>
        <ElFormItem label="权限码" prop="code">
          <ElInput v-model="form.code" placeholder="如 system:user:create（三段式小写）" />
        </ElFormItem>
        <ElFormItem v-if="form.type === 'MENU' || form.type === 'DIR'" label="路由路径">
          <ElInput v-model="form.path" placeholder="如 /system/user" />
        </ElFormItem>
        <ElFormItem v-if="form.type === 'MENU' || form.type === 'DIR'" label="图标">
          <ElInput v-model="form.icon" placeholder="iconify 名称，如 ri:user-line" />
        </ElFormItem>
        <ElFormItem label="排序">
          <ElInputNumber v-model="form.sort" :min="0" />
        </ElFormItem>
        <ElFormItem v-if="dialogType === 'edit'" label="状态">
          <ElRadioGroup v-model="form.status">
            <ElRadioButton value="ENABLED">启用</ElRadioButton>
            <ElRadioButton value="DISABLED">禁用</ElRadioButton>
          </ElRadioGroup>
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
  import { PermissionCode } from '@nestperm/contracts'
  import {
    fetchCreatePermission,
    fetchDeletePermission,
    fetchGetPermissionTree,
    fetchUpdatePermission
  } from '@/api/system-manage'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Refresh } from '@element-plus/icons-vue'

  defineOptions({ name: 'SystemPermission' })

  type PermItem = Api.SystemManage.PermissionItem

  const TYPE_TEXT: Record<PermItem['type'], string> = {
    DIR: '目录',
    MENU: '菜单',
    BUTTON: '按钮',
    API: '接口'
  }
  const TYPE_TAG: Record<PermItem['type'], 'primary' | 'success' | 'warning' | 'info'> = {
    DIR: 'info',
    MENU: 'primary',
    BUTTON: 'warning',
    API: 'success'
  }

  // 表格模板里 row 无类型，经辅助函数收口
  const typeText = (t: string) => TYPE_TEXT[t as PermItem['type']] ?? t
  const typeTag = (t: string) => TYPE_TAG[t as PermItem['type']] ?? 'info'

  const loading = ref(false)
  const submitting = ref(false)
  const tree = ref<PermItem[]>([])

  // 父级可选范围：只允许目录/菜单作为父级
  const parentOptions = computed(() => filterSelectable(tree.value))
  const filterSelectable = (nodes: PermItem[]): PermItem[] =>
    nodes
      .filter((n) => n.type !== 'BUTTON' && n.type !== 'API')
      .map((n) => ({ ...n, children: n.children?.length ? filterSelectable(n.children) : [] }))

  const loadData = async () => {
    loading.value = true
    try {
      tree.value = await fetchGetPermissionTree()
    } finally {
      loading.value = false
    }
  }

  // ---------- 新增/编辑 ----------
  const dialogVisible = ref(false)
  const dialogType = ref<'add' | 'edit'>('add')
  const formRef = ref<FormInstance>()
  const currentId = ref('')
  const form = reactive({
    parentId: undefined as string | undefined,
    name: '',
    code: '',
    type: 'MENU' as PermItem['type'],
    path: '',
    icon: '',
    sort: 0,
    status: 'ENABLED' as Api.Common.EnableStatus
  })

  const formRules: FormRules = {
    name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
    code: [
      { required: true, message: '请输入权限码', trigger: 'blur' },
      {
        pattern: /^[a-z0-9]+(:[a-z0-9-]+){0,2}$/,
        message: '格式：{模块}:{资源}:{动作}，小写',
        trigger: 'blur'
      }
    ],
    type: [{ required: true, message: '请选择类型', trigger: 'change' }]
  }

  const openDialog = (type: 'add' | 'edit', row?: PermItem) => {
    dialogType.value = type
    currentId.value = type === 'edit' ? (row?.id ?? '') : ''
    Object.assign(form, {
      parentId: type === 'add' ? row?.id : (row?.parentId ?? undefined),
      name: type === 'edit' ? row?.name : '',
      code: type === 'edit' ? row?.code : '',
      type: type === 'edit' ? row?.type : row?.type === 'DIR' ? 'MENU' : 'BUTTON',
      path: type === 'edit' ? (row?.path ?? '') : '',
      icon: type === 'edit' ? (row?.icon ?? '') : '',
      sort: type === 'edit' ? (row?.sort ?? 0) : 0,
      status: row?.status ?? 'ENABLED'
    })
    dialogVisible.value = true
  }

  const submitForm = async () => {
    await formRef.value?.validate()
    submitting.value = true
    try {
      if (dialogType.value === 'add') {
        await fetchCreatePermission({
          parentId: form.parentId,
          name: form.name,
          code: form.code,
          type: form.type,
          path: form.path || undefined,
          icon: form.icon || undefined,
          sort: form.sort
        })
        ElMessage.success('创建成功')
      } else {
        await fetchUpdatePermission(currentId.value, {
          name: form.name,
          code: form.code,
          path: form.path || undefined,
          icon: form.icon || undefined,
          sort: form.sort,
          status: form.status
        })
        ElMessage.success('更新成功')
      }
      dialogVisible.value = false
      loadData()
    } finally {
      submitting.value = false
    }
  }

  const handleDelete = async (row: PermItem) => {
    await ElMessageBox.confirm(
      `确定删除「${row.name}」吗？存在子级或被角色引用时将拒绝删除。`,
      '警告',
      { type: 'error', confirmButtonText: '删除' }
    )
    await fetchDeletePermission(row.id)
    ElMessage.success('删除成功')
    loadData()
  }

  onMounted(loadData)
</script>
