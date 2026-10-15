<!-- 角色管理 -->
<template>
  <div class="art-full-height">
    <ElCard class="mb-3" shadow="never">
      <ElForm :model="searchForm" inline>
        <ElFormItem label="关键词">
          <ElInput
            v-model="searchForm.keyword"
            placeholder="角色编码 / 名称"
            clearable
            style="width: 200px"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="handleSearch" v-ripple>搜索</ElButton>
          <ElButton @click="handleReset" v-ripple>重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <ElCard class="art-table-card" shadow="never">
      <div class="flex-cb mb-3">
        <ElButton
          type="primary"
          @click="openDialog('add')"
          v-auth="PermissionCode.SystemRoleCreate"
          v-ripple
        >
          新增角色
        </ElButton>
        <ElButton circle @click="loadData" v-ripple>
          <ElIcon><Refresh /></ElIcon>
        </ElButton>
      </div>

      <ElTable :data="list" v-loading="loading" row-key="id" stripe>
        <ElTableColumn prop="name" label="角色名称" min-width="140" />
        <ElTableColumn prop="code" label="编码" min-width="120">
          <template #default="{ row }">
            <code class="text-xs bg-g-200 rounded px-1.5 py-0.5">{{ row.code }}</code>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="dataScope" label="数据权限" width="130">
          <template #default="{ row }">
            <ElTag size="small" :type="dataScopeTagType(row.dataScope)">
              {{ dataScopeText(row.dataScope) }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="状态" width="90">
          <template #default="{ row }">
            <ElTag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
              {{ row.status === 'ENABLED' ? '启用' : '禁用' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="remark" label="备注" min-width="160">
          <template #default="{ row }">{{ row.remark ?? '-' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="290" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="primary"
              @click="openDialog('edit', row)"
              v-auth="PermissionCode.SystemRoleUpdate"
            >
              编辑
            </ElButton>
            <ElButton
              link
              type="primary"
              @click="openPermDrawer(row)"
              v-auth="PermissionCode.SystemRoleAssignPerms"
              >分配权限</ElButton
            >
            <ElButton
              link
              type="primary"
              @click="openScopeDialog(row)"
              v-auth="PermissionCode.SystemRoleAssignPerms"
              >数据范围</ElButton
            >
            <ElButton
              link
              type="danger"
              @click="handleDelete(row)"
              v-auth="PermissionCode.SystemRoleDelete"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="flex justify-end mt-4">
        <ElPagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadData"
          @size-change="loadData"
        />
      </div>
    </ElCard>

    <!-- 新增/编辑角色 -->
    <ElDialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增角色' : '编辑角色'"
      width="480px"
    >
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <ElFormItem label="角色编码" prop="code">
          <ElInput
            v-model="form.code"
            :disabled="dialogType === 'edit'"
            placeholder="小写字母/数字/中划线，如 auditor"
          />
        </ElFormItem>
        <ElFormItem label="角色名称" prop="name">
          <ElInput v-model="form.name" />
        </ElFormItem>
        <ElFormItem label="排序">
          <ElInputNumber v-model="form.sort" :min="0" />
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

    <!-- 分配权限 -->
    <ElDrawer v-model="permVisible" title="分配权限" size="420px">
      <div class="mb-3 text-sm text-g-600">
        当前角色：<b>{{ currentRole?.name }}</b
        >（勾选目录/菜单会联动其下按钮）
      </div>
      <ElTree
        ref="permTreeRef"
        :data="permTree"
        show-checkbox
        node-key="id"
        :props="{ label: 'name', children: 'children' }"
        default-expand-all
      />
      <template #footer>
        <ElButton @click="permVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitPerms"
          >保存（即时生效）</ElButton
        >
      </template>
    </ElDrawer>

    <!-- 数据范围 -->
    <ElDialog v-model="scopeVisible" title="数据权限范围" width="480px">
      <ElForm label-width="90px">
        <ElFormItem label="范围">
          <ElSelect v-model="scopeForm.dataScope" style="width: 100%">
            <ElOption
              v-for="(text, key) in DATA_SCOPE_TEXT"
              :key="key"
              :label="text"
              :value="key"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-if="scopeForm.dataScope === 'CUSTOM'" label="自定义部门">
          <ElTree
            ref="deptTreeRef"
            :data="deptTree"
            show-checkbox
            node-key="id"
            :props="{ label: 'name', children: 'children' }"
            default-expand-all
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="scopeVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitScope">确定</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { PermissionCode } from '@nestperm/contracts'
  import {
    fetchAssignRolePermissions,
    fetchCreateRole,
    fetchDeleteRole,
    fetchGetDeptTree,
    fetchGetPermissionTree,
    fetchGetRoleList,
    fetchSetRoleDataScope,
    fetchUpdateRole
  } from '@/api/system-manage'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Refresh } from '@element-plus/icons-vue'
  import type { ElTree } from 'element-plus'

  defineOptions({ name: 'SystemRole' })

  type RoleItem = Api.SystemManage.RoleListItem
  type DeptItem = Api.SystemManage.DeptItem

  const DATA_SCOPE_TEXT: Record<RoleItem['dataScope'], string> = {
    ALL: '全部数据',
    DEPT_AND_CHILDREN: '本部门及以下',
    DEPT: '仅本部门',
    SELF: '仅本人',
    CUSTOM: '自定义部门'
  }

  // 表格模板里 row 无类型，经辅助函数收口
  const dataScopeText = (scope: string) => DATA_SCOPE_TEXT[scope as RoleItem['dataScope']] ?? scope

  const dataScopeTagType = (scope: RoleItem['dataScope']) =>
    scope === 'ALL' ? 'danger' : scope === 'SELF' ? 'info' : 'warning'

  const loading = ref(false)
  const submitting = ref(false)
  const list = ref<RoleItem[]>([])
  const total = ref(0)
  const query = reactive({ page: 1, pageSize: 20 })
  const searchForm = reactive({ keyword: '' })

  const formatTime = (s: string) =>
    s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '-'

  const loadData = async () => {
    loading.value = true
    try {
      const res = await fetchGetRoleList({
        ...query,
        keyword: searchForm.keyword || undefined
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
    handleSearch()
  }

  // ---------- 新增/编辑 ----------
  const dialogVisible = ref(false)
  const dialogType = ref<'add' | 'edit'>('add')
  const formRef = ref<FormInstance>()
  const currentRole = ref<RoleItem | null>(null)
  const form = reactive({ code: '', name: '', sort: 0, remark: '' })

  const formRules: FormRules = {
    code: [
      { required: true, message: '请输入角色编码', trigger: 'blur' },
      { pattern: /^[a-z0-9-]{2,32}$/, message: '小写字母、数字、中划线', trigger: 'blur' }
    ],
    name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }]
  }

  const openDialog = (type: 'add' | 'edit', row?: RoleItem) => {
    dialogType.value = type
    currentRole.value = row ?? null
    Object.assign(form, {
      code: row?.code ?? '',
      name: row?.name ?? '',
      sort: row?.sort ?? 0,
      remark: row?.remark ?? ''
    })
    dialogVisible.value = true
  }

  const submitForm = async () => {
    await formRef.value?.validate()
    submitting.value = true
    try {
      if (dialogType.value === 'add') {
        await fetchCreateRole({ ...form, dataScope: 'SELF' })
        ElMessage.success('创建成功')
      } else if (currentRole.value) {
        await fetchUpdateRole(currentRole.value.id, { ...form })
        ElMessage.success('更新成功')
      }
      dialogVisible.value = false
      loadData()
    } finally {
      submitting.value = false
    }
  }

  // ---------- 分配权限 ----------
  const permVisible = ref(false)
  const permTree = ref<Api.SystemManage.PermissionItem[]>([])
  const permTreeRef = ref<InstanceType<typeof ElTree>>()

  const openPermDrawer = async (row: RoleItem) => {
    currentRole.value = row
    if (!permTree.value.length) {
      permTree.value = await fetchGetPermissionTree()
    }
    permVisible.value = true
    await nextTick()
    // 回显已分配（只勾选叶子，父级由树组件按子级状态半选/全选推导）
    const leafIds = row.permissionIds.filter((id) => {
      const node = findNode(permTree.value, id)
      return node && !node.children?.length
    })
    permTreeRef.value?.setCheckedKeys(leafIds)
  }

  const findNode = (
    nodes: Api.SystemManage.PermissionItem[],
    id: string
  ): Api.SystemManage.PermissionItem | null => {
    for (const n of nodes) {
      if (n.id === id) return n
      const found = n.children?.length ? findNode(n.children, id) : null
      if (found) return found
    }
    return null
  }

  const submitPerms = async () => {
    if (!currentRole.value) return
    submitting.value = true
    try {
      const checked = permTreeRef.value?.getCheckedKeys() ?? []
      const half = permTreeRef.value?.getHalfCheckedKeys() ?? []
      await fetchAssignRolePermissions(currentRole.value.id, [...checked, ...half] as string[])
      ElMessage.success('权限已更新，相关用户即时生效')
      permVisible.value = false
      loadData()
    } finally {
      submitting.value = false
    }
  }

  // ---------- 数据范围 ----------
  const scopeVisible = ref(false)
  const deptTree = ref<DeptItem[]>([])
  const deptTreeRef = ref<InstanceType<typeof ElTree>>()
  const scopeForm = reactive<{ dataScope: RoleItem['dataScope'] }>({ dataScope: 'SELF' })

  const openScopeDialog = async (row: RoleItem) => {
    currentRole.value = row
    scopeForm.dataScope = row.dataScope
    if (!deptTree.value.length) {
      deptTree.value = await fetchGetDeptTree()
    }
    scopeVisible.value = true
    await nextTick()
    if (row.dataScope === 'CUSTOM') {
      deptTreeRef.value?.setCheckedKeys(row.deptIds)
    }
  }

  const submitScope = async () => {
    if (!currentRole.value) return
    const deptIds =
      scopeForm.dataScope === 'CUSTOM'
        ? ([...(deptTreeRef.value?.getCheckedKeys() ?? [])] as string[])
        : undefined
    if (scopeForm.dataScope === 'CUSTOM' && !deptIds?.length) {
      ElMessage.warning('自定义范围请至少勾选一个部门')
      return
    }
    submitting.value = true
    try {
      await fetchSetRoleDataScope(currentRole.value.id, scopeForm.dataScope, deptIds)
      ElMessage.success('数据范围已更新')
      scopeVisible.value = false
      loadData()
    } finally {
      submitting.value = false
    }
  }

  const handleDelete = async (row: RoleItem) => {
    await ElMessageBox.confirm(
      `确定删除角色「${row.name}」吗？已分配用户的角色无法删除。`,
      '警告',
      { type: 'error', confirmButtonText: '删除' }
    )
    await fetchDeleteRole(row.id)
    ElMessage.success('删除成功')
    loadData()
  }

  onMounted(loadData)
</script>
