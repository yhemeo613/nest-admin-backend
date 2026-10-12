<!-- 系统资源概览 + 快捷入口（均为真实数据/真实路由） -->
<template>
  <div class="art-card p-5 mb-5 max-sm:mb-4">
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- 资源明细 -->
      <div>
        <h3 class="mb-4 text-base font-medium">资源概览</h3>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div v-for="item in resourceItems" :key="item.label" class="rounded-lg bg-g-100 p-3.5">
            <div class="text-xs text-g-500">{{ item.label }}</div>
            <div class="mt-1 truncate text-lg font-medium text-g-800" :title="item.value">
              {{ item.value }}
            </div>
          </div>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div>
        <h3 class="mb-4 text-base font-medium">快捷入口</h3>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div
            v-for="entry in quickEntries"
            :key="entry.path"
            v-auth="entry.auth"
            class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-g-200 bg-white p-3.5 transition-all hover:border-theme hover:shadow-sm dark:bg-transparent"
            @click="router.push(entry.path)"
          >
            <ArtSvgIcon :icon="entry.icon" class="text-lg text-theme" />
            <span class="text-sm text-g-700">{{ entry.label }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    stats: Api.Dashboard.Stats | null
  }>()

  const router = useRouter()

  const resourceItems = computed(() => {
    const ai = props.stats?.ai
    const system = props.stats?.system
    return [
      { label: '角色总数', value: String(system?.roles ?? '-') },
      { label: '部门总数', value: String(system?.departments ?? '-') },
      { label: '启用供应商', value: String(ai?.providers ?? '-') },
      { label: '启用模型', value: String(ai?.models ?? '-') },
      { label: '默认模型', value: ai?.defaultModel ?? '-' },
      { label: '累计调用', value: String(ai?.callsTotal ?? '-') }
    ]
  })

  /** 快捷入口：全部为已存在的真实页面，按钮级权限控制显隐 */
  const quickEntries = [
    { label: '用户管理', icon: 'ri:user-line', path: '/system/user', auth: 'system:user:list' },
    {
      label: '角色管理',
      icon: 'ri:shield-user-line',
      path: '/system/role',
      auth: 'system:role:list'
    },
    {
      label: '权限管理',
      icon: 'ri:lock-line',
      path: '/system/menu',
      auth: 'system:permission:list'
    },
    { label: 'AI 问答', icon: 'ri:chat-3-line', path: '/ai/chat', auth: 'ai:chat' },
    { label: '模型配置', icon: 'ri:server-line', path: '/ai/config', auth: 'ai:config' },
    { label: '用量报表', icon: 'ri:bar-chart-2-line', path: '/ai/usage', auth: 'ai:usage:list' }
  ]
</script>
