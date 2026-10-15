<!-- 忘记密码引导页（本地部署无邮件/短信通道，由平台管理员重置） -->
<template>
  <div class="flex w-full h-screen">
    <LoginLeftView />

    <div class="relative flex-1">
      <AuthTopBar />

      <div class="auth-right-wrap">
        <div class="form">
          <h3 class="title">忘记密码</h3>
          <p class="sub-title">为了账号安全，密码重置需要平台管理员协助</p>

          <ElCard class="mt-6" shadow="never">
            <div class="space-y-3 text-sm text-g-700">
              <p>1. 联系平台管理员，提供你的登录账号；</p>
              <p>2. 管理员在「系统管理 → 用户管理」中为你重置密码；</p>
              <p>3. 重置后使用新密码重新登录（原会话会被强制下线）。</p>
            </div>
          </ElCard>

          <div class="mt-6 text-sm text-center text-g-600">
            想起来了？
            <RouterLink class="text-blue-500" :to="RoutesAlias.Login">返回登录</RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { RoutesAlias } from '@/router/routesAlias'

  defineOptions({ name: 'ForgetPassword' })
</script>

<style scoped>
  @import '../login/style.css';
</style>
