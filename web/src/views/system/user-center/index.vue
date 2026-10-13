<!-- 个人中心：资料维护与密码修改（自助服务，登录即可） -->
<template>
  <div class="art-full-height">
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <!-- 资料卡 -->
      <ElCard shadow="never">
        <div class="flex flex-col items-center py-4">
          <ElAvatar :size="84" class="mb-3 bg-blue-500 text-2xl">
            {{ avatarText }}
          </ElAvatar>
          <div class="text-lg font-semibold">{{ userInfo.userName }}</div>
          <div class="mt-1 text-sm text-g-500">{{ userInfo.nickName }}</div>
          <div class="mt-3 flex flex-wrap justify-center gap-1">
            <ElTag v-for="r in userInfo.roles" :key="r" size="small">{{ r }}</ElTag>
            <ElTag v-if="userInfo.isSuper" size="small" type="danger">超级管理员</ElTag>
          </div>
        </div>
      </ElCard>

      <!-- 基本资料 -->
      <ElCard shadow="never" class="lg:col-span-2">
        <template #header>基本资料</template>
        <ElForm ref="profileRef" :model="profileForm" :rules="profileRules" label-width="80px">
          <ElFormItem label="用户名">
            <ElInput :model-value="userInfo.userName" disabled />
          </ElFormItem>
          <ElFormItem label="昵称" prop="nickname">
            <ElInput v-model="profileForm.nickname" maxlength="32" placeholder="显示昵称" />
          </ElFormItem>
          <ElFormItem label="邮箱" prop="email">
            <ElInput v-model="profileForm.email" placeholder="选填" />
          </ElFormItem>
          <ElFormItem label="手机号" prop="phone">
            <ElInput v-model="profileForm.phone" maxlength="11" placeholder="选填" />
          </ElFormItem>
          <ElFormItem>
            <ElButton type="primary" :loading="profileSaving" @click="saveProfile" v-ripple>
              保存资料
            </ElButton>
          </ElFormItem>
        </ElForm>
      </ElCard>

      <!-- 修改密码 -->
      <ElCard shadow="never" class="lg:col-span-3">
        <template #header>修改密码</template>
        <ElAlert
          type="warning"
          :closable="false"
          title="修改成功后将强制退出登录，需使用新密码重新登录"
          class="mb-4"
        />
        <ElForm
          ref="pwdRef"
          :model="pwdForm"
          :rules="pwdRules"
          label-width="100px"
          style="max-width: 480px"
        >
          <ElFormItem label="当前密码" prop="oldPassword">
            <ElInput v-model="pwdForm.oldPassword" type="password" show-password />
          </ElFormItem>
          <ElFormItem label="新密码" prop="newPassword">
            <ElInput v-model="pwdForm.newPassword" type="password" show-password />
          </ElFormItem>
          <ElFormItem label="确认新密码" prop="confirmPassword">
            <ElInput v-model="pwdForm.confirmPassword" type="password" show-password />
          </ElFormItem>
          <ElFormItem>
            <ElButton type="primary" :loading="pwdSaving" @click="savePassword" v-ripple>
              修改密码
            </ElButton>
          </ElFormItem>
        </ElForm>
      </ElCard>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { fetchChangePassword, fetchUpdateProfile } from '@/api/auth'
  import { useUserStore } from '@/store/modules/user'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

  defineOptions({ name: 'UserCenter' })

  const userStore = useUserStore()
  const userInfo = computed(() => userStore.getUserInfo)
  const avatarText = computed(() =>
    (userInfo.value.nickName || userInfo.value.userName || '?').slice(0, 1)
  )

  // ---------- 基本资料 ----------
  const profileRef = ref<FormInstance>()
  const profileSaving = ref(false)
  const profileForm = reactive({
    nickname: userInfo.value.nickName ?? '',
    email: userInfo.value.email ?? '',
    phone: userInfo.value.phone ?? ''
  })

  const profileRules: FormRules = {
    nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
    email: [
      {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: '邮箱格式不正确',
        trigger: 'blur'
      }
    ],
    phone: [{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }]
  }

  const saveProfile = async () => {
    await profileRef.value?.validate()
    profileSaving.value = true
    try {
      await fetchUpdateProfile({
        nickname: profileForm.nickname,
        email: profileForm.email || undefined,
        phone: profileForm.phone || undefined
      })
      // 同步顶部用户信息（store 本地更新，无需重登）
      userStore.setUserInfo({
        ...userInfo.value,
        nickName: profileForm.nickname
      } as Api.Auth.UserInfo)
      ElMessage.success('资料已保存')
    } finally {
      profileSaving.value = false
    }
  }

  // ---------- 修改密码 ----------
  const pwdRef = ref<FormInstance>()
  const pwdSaving = ref(false)
  const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

  const pwdRules: FormRules = {
    oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
    newPassword: [
      { required: true, message: '请输入新密码', trigger: 'blur' },
      { min: 6, max: 64, message: '密码长度 6-64 位', trigger: 'blur' }
    ],
    confirmPassword: [
      { required: true, message: '请再次输入新密码', trigger: 'blur' },
      {
        validator: (_rule, value: string, callback: (err?: Error) => void) => {
          if (value !== pwdForm.newPassword) callback(new Error('两次输入的密码不一致'))
          else callback()
        },
        trigger: 'blur'
      }
    ]
  }

  const savePassword = async () => {
    await pwdRef.value?.validate()
    pwdSaving.value = true
    try {
      await fetchChangePassword({
        oldPassword: pwdForm.oldPassword,
        newPassword: pwdForm.newPassword
      })
      ElMessage.success('密码已修改，请重新登录')
      userStore.logOut()
    } finally {
      pwdSaving.value = false
    }
  }
</script>
