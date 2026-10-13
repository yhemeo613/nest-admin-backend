<!-- 注册页面：租户自助开通（企业 + 管理员账号一次完成） -->
<template>
  <div class="flex w-full h-screen">
    <LoginLeftView />

    <div class="relative flex-1">
      <AuthTopBar />

      <div class="auth-right-wrap">
        <div class="form">
          <h3 class="title">开通账号</h3>
          <p class="sub-title">注册即开通专属客服工作空间</p>
          <ElForm
            ref="formRef"
            :model="formData"
            :rules="rules"
            style="margin-top: 20px"
            @keyup.enter="handleSubmit"
          >
            <ElFormItem prop="tenantName">
              <ElInput
                class="custom-height"
                placeholder="企业/租户名称，如：星辰电商"
                v-model.trim="formData.tenantName"
              />
            </ElFormItem>
            <ElFormItem prop="tenantCode">
              <ElInput
                class="custom-height"
                placeholder="租户编码（小写字母/数字/中划线，用于帮助中心地址）"
                v-model.trim="formData.tenantCode"
              />
            </ElFormItem>
            <ElFormItem prop="username">
              <ElInput
                class="custom-height"
                placeholder="管理员登录账号"
                v-model.trim="formData.username"
              />
            </ElFormItem>
            <ElFormItem prop="password">
              <ElInput
                class="custom-height"
                placeholder="密码（6-64 位）"
                type="password"
                autocomplete="off"
                show-password
                v-model.trim="formData.password"
              />
            </ElFormItem>
            <ElFormItem prop="confirmPassword">
              <ElInput
                class="custom-height"
                placeholder="确认密码"
                type="password"
                autocomplete="off"
                show-password
                v-model.trim="formData.confirmPassword"
              />
            </ElFormItem>
            <ElFormItem prop="email">
              <ElInput
                class="custom-height"
                placeholder="联系邮箱（选填）"
                v-model.trim="formData.email"
              />
            </ElFormItem>

            <div style="margin-top: 20px">
              <ElButton
                class="w-full custom-height"
                type="primary"
                :loading="loading"
                @click="handleSubmit"
                v-ripple
              >
                注册并开通
              </ElButton>
            </div>

            <div class="mt-4 text-sm text-center text-g-600">
              已有账号？
              <RouterLink class="text-blue-500" :to="RoutesAlias.Login">直接登录</RouterLink>
            </div>
          </ElForm>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { fetchRegister } from '@/api/auth'
  import { RoutesAlias } from '@/router/routesAlias'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

  defineOptions({ name: 'Register' })

  const router = useRouter()
  const loading = ref(false)
  const formRef = ref<FormInstance>()

  const formData = reactive({
    tenantName: '',
    tenantCode: '',
    username: '',
    password: '',
    confirmPassword: '',
    email: ''
  })

  const rules: FormRules = {
    tenantName: [{ required: true, message: '请输入企业/租户名称', trigger: 'blur' }],
    tenantCode: [
      { required: true, message: '请输入租户编码', trigger: 'blur' },
      {
        pattern: /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/,
        message: '仅小写字母、数字、中划线，长度 3-32',
        trigger: 'blur'
      }
    ],
    username: [
      { required: true, message: '请输入管理员账号', trigger: 'blur' },
      { pattern: /^[a-zA-Z0-9_]{2,32}$/, message: '2-32 位字母、数字、下划线', trigger: 'blur' }
    ],
    password: [
      { required: true, message: '请输入密码', trigger: 'blur' },
      { min: 6, max: 64, message: '密码长度 6-64 位', trigger: 'blur' }
    ],
    confirmPassword: [
      { required: true, message: '请再次输入密码', trigger: 'blur' },
      {
        validator: (_rule, value: string, callback: (err?: Error) => void) => {
          if (value !== formData.password) callback(new Error('两次输入的密码不一致'))
          else callback()
        },
        trigger: 'blur'
      }
    ],
    email: [
      {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: '邮箱格式不正确',
        trigger: 'blur'
      }
    ]
  }

  const handleSubmit = async () => {
    if (!formRef.value) return
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return

    loading.value = true
    try {
      await fetchRegister({
        tenantName: formData.tenantName,
        tenantCode: formData.tenantCode,
        username: formData.username,
        password: formData.password,
        email: formData.email || undefined
      })
      ElMessage.success('开通成功，请使用新账号登录')
      router.push(RoutesAlias.Login)
    } finally {
      loading.value = false
    }
  }
</script>

<style scoped>
  @import '../login/style.css';

  /* 注册表单字段更多：放开固定高度，允许滚动 */
  .auth-right-wrap {
    @apply h-auto max-h-screen overflow-y-auto;
  }
</style>
