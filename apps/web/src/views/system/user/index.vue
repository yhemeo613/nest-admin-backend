<!-- 用户管理 -->
<template>
  <div class="art-full-height">
    <!-- 搜索栏 -->
    <ElCard class="mb-3" shadow="never">
      <ElForm :model="searchForm" inline>
        <ElFormItem label="关键词">
          <ElInput
            v-model="searchForm.keyword"
            placeholder="用户名 / 昵称"
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
        <ElButton
          type="primary"
          @click="openDialog('add')"
          v-auth="PermissionCode.SystemUserCreate"
          v-ripple
        >
          新增用户
        </ElButton>
        <ElButton circle @click="loadData" v-ripple>
          <ElIcon><Refresh /></ElIcon>
        </ElButton>
      </div>

      <ElTable :data="list" v-loading="loading" row-key="id" stripe>
        <ElTableColumn prop="username" label="用户名" min-width="140" />
        <ElTableColumn prop="nickname" label="昵称" min-width="120" />
        <ElTableColumn prop="deptName" label="部门" min-width="120">
          <template #default="{ row }">{{ row.deptName ?? '-' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="roles" label="角色" min-width="160">
          <template #default="{ row }">
            <ElTag v-for="r in row.roles" :key="r" class="mr-1" size="small">{{ r }}</ElTag>
            <span v-if="!row.roles?.length">-</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="status" label="状态" width="90">
          <template #default="{ row }">
            <ElTag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
              {{ row.status === 'ENABLED' ? '启用' : '禁用' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="primary"
              @click="openDialog('edit', row)"
              v-auth="PermissionCode.SystemUserUpdate"
              >编辑</ElButton
            >
            <ElButton
              link
              type="primary"
              @click="openAssignDialog(row)"
              v-auth="PermissionCode.SystemUserAssignRoles"
              >分配角色</ElButton
            >
            <ElButton
              link
              type="warning"
              @click="openResetDialog(row)"
              v-auth="PermissionCode.SystemUserResetPassword"
              >重置密码</ElButton
            >
            <ElButton
              link
              :type="row.status === 'ENABLED' ? 'warning' : 'success'"
              @click="toggleStatus(row)"
              v-auth="PermissionCode.SystemUserUpdate"
              >{{ row.status === 'ENABLED' ? '禁用' : '启用' }}</ElButton
            >
            <ElButton
              link
              type="danger"
              @click="handleDelete(row)"
              v-auth="PermissionCode.SystemUserDelete"
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

    <!-- 新增/编辑用户 -->
    <ElDialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增用户' : '编辑用户'"
      width="480px"
    >
      <ElForm ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <ElFormItem label="用户名" prop="username">
          <ElInput
            v-model="form.username"
            :disabled="dialogType === 'edit'"
            placeholder="登录账号"
          />
        </ElFormItem>
        <ElFormItem v-if="dialogType === 'add'" label="初始密码" prop="password">
          <ElInput v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </ElFormItem>
        <ElFormItem label="昵称" prop="nickname">
          <ElInput v-model="form.nickname" />
        </ElFormItem>
        <ElFormItem label="邮箱">
          <ElInput v-model="form.email" />
        </ElFormItem>
        <ElFormItem label="手机号">
          <ElInput v-model="form.phone" />
        </ElFormItem>
        <ElFormItem label="部门">
          <ElTreeSelect
            v-model="form.deptId"
            :data="deptTree"
            :props="{ label: 'name', value: 'id' }"
            check-strictly
            clearable
            placeholder="选择部门"
            style="width: 100%"
          />
        </ElFormItem>
        <ElFormItem v-if="dialogType === 'add'" label="角色">
          <ElSelect v-model="form.roleIds" multiple style="width: 100%">
            <ElOption v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitForm">确定</ElButton>
      </template>
    </ElDialog>

    <!-- 分配角色 -->
    <ElDialog v-model="assignVisible" title="分配角色" width="420px">
      <ElCheckboxGroup v-model="assignRoleIds">
        <ElCheckbox v-for="r in roleOptions" :key="r.id" :value="r.id" class="w-full">
          {{ r.name }}（{{ r.code }}）
        </ElCheckbox>
      </ElCheckboxGroup>
      <template #footer>
        <ElButton @click="assignVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitAssign">确定</ElButton>
      </template>
    </ElDialog>

    <!-- 重置密码 -->
    <ElDialog v-model="resetVisible" title="重置密码" width="420px">
      <ElAlert
        type="warning"
        :closable="false"
        title="重置后该用户将被强制下线，需重新登录"
        class="mb-3"
      />
      <ElForm ref="resetFormRef" :model="resetForm" :rules="resetRules" label-width="80px">
        <ElFormItem label="新密码" prop="password">
          <ElInput
            v-model="resetForm.password"
            type="password"
            show-password
            placeholder="至少 6 位"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="resetVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submitReset">确定</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { PermissionCode } from '@nestperm/contracts'
  import {
    fetchAssignUserRoles,
    fetchCreateUser,
    fetchDeleteUser,
    fetchGetDeptTree,
    fetchGetRoleList,
    fetchGetUserList,
    fetchResetUserPassword,
    fetchUpdateUser,
    fetchUpdateUserStatus
  } from '@/api/system-manage'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import { Refresh } from '@element-plus/icons-vue'

  defineOptions({ name: 'SystemUser' })

  type UserItem = Api.SystemManage.UserListItem
  type RoleItem = Api.SystemManage.RoleListItem
  type DeptItem = Api.SystemManage.DeptItem

  const loading = ref(false)
  const submitting = ref(false)
  const list = ref<UserItem[]>([])
  const total = ref(0)
  const query = reactive({ page: 1, pageSize: 20 })
  const searchForm = reactive({ keyword: '', status: undefined as string | undefined })

  const deptTree = ref<DeptItem[]>([])
  const roleOptions = ref<RoleItem[]>([])

  const formatTime = (s: string) =>
    s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '-'

  const loadData = async () => {
    loading.value = true
    try {
      const res = await fetchGetUserList({
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
    username: '',
    password: '',
    nickname: '',
    email: '',
    phone: '',
    deptId: undefined as string | undefined,
    roleIds: [] as string[]
  })

  const formRules: FormRules = {
    username: [
      { required: true, message: '请输入用户名', trigger: 'blur' },
      { pattern: /^[a-zA-Z0-9_]{2,32}$/, message: '2-32 位字母、数字、下划线', trigger: 'blur' }
    ],
    password: [
      { required: true, message: '请输入初始密码', trigger: 'blur' },
      { min: 6, max: 64, message: '密码长度 6-64 位', trigger: 'blur' }
    ],
    nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }]
  }

  const openDialog = (type: 'add' | 'edit', row?: UserItem) => {
    dialogType.value = type
    currentId.value = row?.id ?? ''
    Object.assign(form, {
      username: row?.username ?? '',
      password: '',
      nickname: row?.nickname ?? '',
      email: row?.email ?? '',
      phone: row?.phone ?? '',
      deptId: row?.deptId ?? undefined,
      roleIds: []
    })
    dialogVisible.value = true
  }

  const submitForm = async () => {
    await formRef.value?.validate()
    submitting.value = true
    try {
      if (dialogType.value === 'add') {
        await fetchCreateUser({
          username: form.username,
          password: form.password,
          nickname: form.nickname,
          email: form.email || undefined,
          phone: form.phone || undefined,
          deptId: form.deptId,
          roleIds: form.roleIds.length ? form.roleIds : undefined
        })
        ElMessage.success('创建成功')
      } else {
        await fetchUpdateUser(currentId.value, {
          nickname: form.nickname,
          email: form.email || undefined,
          phone: form.phone || undefined,
          deptId: form.deptId
        })
        ElMessage.success('更新成功')
      }
      dialogVisible.value = false
      loadData()
    } finally {
      submitting.value = false
    }
  }

  // ---------- 分配角色 ----------
  const assignVisible = ref(false)
  const assignRoleIds = ref<string[]>([])

  const openAssignDialog = (row: UserItem) => {
    currentId.value = row.id
    // 按角色编码反推角色 ID
    assignRoleIds.value = roleOptions.value
      .filter((r) => row.roles?.includes(r.code))
      .map((r) => r.id)
    assignVisible.value = true
  }

  const submitAssign = async () => {
    if (!assignRoleIds.value.length) {
      ElMessage.warning('请至少选择一个角色')
      return
    }
    submitting.value = true
    try {
      await fetchAssignUserRoles(currentId.value, assignRoleIds.value)
      ElMessage.success('分配成功，权限即时生效')
      assignVisible.value = false
      loadData()
    } finally {
      submitting.value = false
    }
  }

  // ---------- 重置密码 ----------
  const resetVisible = ref(false)
  const resetFormRef = ref<FormInstance>()
  const resetForm = reactive({ password: '' })
  const resetRules: FormRules = {
    password: [
      { required: true, message: '请输入新密码', trigger: 'blur' },
      { min: 6, max: 64, message: '密码长度 6-64 位', trigger: 'blur' }
    ]
  }

  const openResetDialog = (row: UserItem) => {
    currentId.value = row.id
    resetForm.password = ''
    resetVisible.value = true
  }

  const submitReset = async () => {
    await resetFormRef.value?.validate()
    submitting.value = true
    try {
      await fetchResetUserPassword(currentId.value, resetForm.password)
      ElMessage.success('密码已重置')
      resetVisible.value = false
    } finally {
      submitting.value = false
    }
  }

  // ---------- 状态/删除 ----------
  const toggleStatus = async (row: UserItem) => {
    const target = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
    await ElMessageBox.confirm(
      target === 'DISABLED' ? '禁用后该用户将被强制下线，确认禁用？' : '确认启用该用户？',
      '提示',
      { type: 'warning' }
    )
    await fetchUpdateUserStatus(row.id, target)
    ElMessage.success('操作成功')
    loadData()
  }

  const handleDelete = async (row: UserItem) => {
    await ElMessageBox.confirm(`确定删除用户「${row.username}」吗？`, '警告', {
      type: 'error',
      confirmButtonText: '删除'
    })
    await fetchDeleteUser(row.id)
    ElMessage.success('删除成功')
    loadData()
  }

  onMounted(async () => {
    loadData()
    fetchGetDeptTree().then((res) => (deptTree.value = res))
    fetchGetRoleList({ page: 1, pageSize: 100 }).then((res) => (roleOptions.value = res.list))
  })
</script>
