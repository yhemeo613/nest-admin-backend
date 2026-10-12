<!-- 部门管理（树形结构，数据权限载体） -->
<template>
  <div class="art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <div class="flex-cb mb-3">
        <ElButton type="primary" @click="openDialog('add')" v-auth="'system:dept:create'" v-ripple>
          新增部门
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
        <ElTableColumn prop="name" label="部门名称" min-width="200" />
        <ElTableColumn prop="sort" label="排序" width="80" />
        <ElTableColumn prop="status" label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
              {{ row.status === 'ENABLED' ? '启用' : '禁用' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="primary"
              @click="openDialog('add', row)"
              v-auth="'system:dept:create'"
            >
              新增子部门
            </ElButton>
            <ElButton
              link
              type="primary"
              @click="openDialog('edit', row)"
              v-auth="'system:dept:update'"
            >
              编辑
            </ElButton>
            <ElButton link type="danger" @click="handleDelete(row)" v-auth="'system:dept:delete'">
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增部门' : '编辑部门'"
      width="460px"
    >
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <ElFormItem label="父级部门">
          <ElTreeSelect
            v-model="form.parentId"
            :data="tree"
            :props="{ label: 'name', value: 'id' }"
            check-strictly
            clearable
            placeholder="留空为根部门"
            style="width: 100%"
          />
        </ElFormItem>
        <ElFormItem label="名称" prop="name">
          <ElInput v-model="form.name" placeholder="如：技术部" />
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
  import {
    fetchCreateDept,
    fetchDeleteDept,
    fetchGetDeptTree,
    fetchUpdateDept
  } from '@/api/system-manage'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Refresh } from '@element-plus/icons-vue'

  defineOptions({ name: 'SystemDept' })

  type DeptItem = Api.SystemManage.DeptItem

  const loading = ref(false)
  const submitting = ref(false)
  const tree = ref<DeptItem[]>([])

  const formatTime = (s: string) =>
    s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '-'

  const loadData = async () => {
    loading.value = true
    try {
      tree.value = await fetchGetDeptTree()
    } finally {
      loading.value = false
    }
  }

  const dialogVisible = ref(false)
  const dialogType = ref<'add' | 'edit'>('add')
  const formRef = ref<FormInstance>()
  const currentId = ref('')
  const form = reactive({
    parentId: undefined as string | undefined,
    name: '',
    sort: 0,
    status: 'ENABLED' as Api.Common.EnableStatus
  })

  const formRules: FormRules = {
    name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }]
  }

  const openDialog = (type: 'add' | 'edit', row?: DeptItem) => {
    dialogType.value = type
    currentId.value = type === 'edit' ? (row?.id ?? '') : ''
    Object.assign(form, {
      parentId: type === 'add' ? row?.id : (row?.parentId ?? undefined),
      name: type === 'edit' ? row?.name : '',
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
        await fetchCreateDept({ parentId: form.parentId, name: form.name, sort: form.sort })
        ElMessage.success('创建成功')
      } else {
        await fetchUpdateDept(currentId.value, {
          parentId: form.parentId,
          name: form.name,
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

  const handleDelete = async (row: DeptItem) => {
    await ElMessageBox.confirm(
      `确定删除部门「${row.name}」吗？存在子部门或部门下有用户时将拒绝删除。`,
      '警告',
      { type: 'error', confirmButtonText: '删除' }
    )
    await fetchDeleteDept(row.id)
    ElMessage.success('删除成功')
    loadData()
  }

  onMounted(loadData)
</script>
