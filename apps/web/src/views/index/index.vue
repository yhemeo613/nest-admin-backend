<!-- 布局容器 -->
<template>
  <div class="app-layout">
    <aside id="app-sidebar">
      <ArtSidebarMenu />
    </aside>

    <main id="app-main">
      <div id="app-header">
        <ArtHeaderBar />
      </div>
      <div id="app-content">
        <ArtPageContent />
      </div>
    </main>

    <div id="app-global">
      <ArtGlobalComponent />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted } from 'vue'
  import { useNoticeStore } from '@/store/modules/notice'

  defineOptions({ name: 'AppLayout' })

  // 登录后初始化评审通知（SSE + 未读数）；退出登录时断开
  const noticeStore = useNoticeStore()
  onMounted(() => void noticeStore.init())
  onBeforeUnmount(() => noticeStore.destroy())
</script>

<style lang="scss" scoped>
  @use './style';
</style>
