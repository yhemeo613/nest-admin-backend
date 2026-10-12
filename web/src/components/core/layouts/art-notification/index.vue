<!-- 通知中心面板：真实接口驱动（/api/v1/notifications），未读角标 / 单条已读 / 全部已读 / 清空已读 -->
<template>
  <div
    class="art-notification-panel art-card-sm !shadow-xl"
    :style="{
      transform: show ? 'scaleY(1)' : 'scaleY(0.9)',
      opacity: show ? 1 : 0
    }"
    v-show="visible"
    @click.stop
  >
    <div class="flex-cb px-3.5 mt-3.5">
      <span class="text-base font-medium text-g-800">{{ $t('notice.title') }}</span>
      <span
        class="text-xs px-1.5 py-1 c-p select-none rounded hover:bg-g-200"
        :class="noticeStore.totalUnread ? 'text-theme' : 'text-g-400 cursor-not-allowed'"
        @click="handleMarkAllRead"
      >
        {{ $t('notice.btnRead') }}
      </span>
    </div>

    <ul class="box-border flex items-end w-full h-12.5 px-3.5 border-b-d">
      <li
        v-for="(item, index) in barList"
        :key="item.kind"
        class="h-12 leading-12 mr-5 overflow-hidden text-[13px] text-g-700 c-p select-none"
        :class="{ 'bar-active': barActiveIndex === index }"
        @click="changeBar(index)"
      >
        {{ item.name }}<template v-if="item.num > 0"> ({{ item.num }})</template>
      </li>
    </ul>

    <div class="w-full h-[calc(100%-95px)]">
      <div class="h-[calc(100%-60px)] overflow-y-scroll scrollbar-thin">
        <ul v-if="currentTabItems.length">
          <li
            v-for="item in currentTabItems"
            :key="item.id"
            class="box-border flex px-3.5 py-3.5 c-p last:border-b-0 hover:bg-g-200/60"
            @click="handleItemClick(item)"
          >
            <div
              class="size-9 shrink-0 leading-9 text-center rounded-lg flex-cc"
              :class="[getNoticeStyle(item.type).iconClass]"
            >
              <ArtSvgIcon class="text-lg !bg-transparent" :icon="getNoticeStyle(item.type).icon" />
            </div>
            <div class="w-[calc(100%-45px)] ml-3.5 min-w-0">
              <h4
                class="text-sm leading-5.5 flex items-center gap-1.5"
                :class="item.read ? 'font-normal text-g-500' : 'font-medium text-g-900'"
              >
                <span class="size-1.5 shrink-0 rounded-full bg-primary" v-if="!item.read" />
                <span class="truncate">{{ item.title }}</span>
              </h4>
              <p v-if="item.content" class="mt-1 truncate text-xs text-g-500">
                {{ item.content }}
              </p>
              <p class="mt-1 text-xs text-g-400">{{ formatTime(item.createdAt) }}</p>
            </div>
          </li>
        </ul>

        <!-- 空状态 -->
        <div v-else class="relative top-25 h-full text-g-500 text-center !bg-transparent">
          <ArtSvgIcon icon="system-uicons:inbox" class="text-5xl" />
          <p class="mt-3.5 text-xs !bg-transparent"
            >{{ $t('notice.text[0]') }}{{ barList[barActiveIndex].name }}</p
          >
        </div>
      </div>

      <div class="relative box-border w-full px-3.5">
        <ElButton
          class="w-full mt-3"
          :disabled="currentReadCount === 0"
          @click="handleClearRead"
          v-ripple
        >
          {{ $t('notice.clearRead') }}
        </ElButton>
      </div>
    </div>

    <div class="h-25"></div>
  </div>
</template>

<script setup lang="ts">
  import { useNoticeStore } from '@/store/modules/notice'
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'

  defineOptions({ name: 'ArtNotification' })

  type TabKind = Api.Notify.NotifyType
  type NoticeStyle = { icon: string; iconClass: string }

  const { t } = useI18n()

  const props = defineProps<{
    value: boolean
  }>()

  const emit = defineEmits<{
    'update:value': [value: boolean]
  }>()

  const noticeStore = useNoticeStore()

  const show = ref(false)
  const visible = ref(false)
  const barActiveIndex = ref(0)

  const TAB_KINDS: TabKind[] = ['NOTICE', 'MESSAGE', 'TODO']

  // 面板打开时强制刷新，保证角标与服务端一致
  watch(
    () => props.value,
    (open) => {
      if (open) {
        showNotice(true)
        void noticeStore.load(true)
      } else {
        showNotice(false)
      }
    }
  )

  const barList = computed(() =>
    TAB_KINDS.map((kind, index) => ({
      kind,
      name: t(`notice.bar[${index}]`),
      num: noticeStore.counts[kind] ?? 0
    }))
  )

  const currentTabItems = computed(() => {
    const kind = TAB_KINDS[barActiveIndex.value]
    if (kind === 'NOTICE') return noticeStore.notices
    if (kind === 'MESSAGE') return noticeStore.messages
    return noticeStore.pendings
  })

  const currentReadCount = computed(() => currentTabItems.value.filter((i) => i.read).length)

  const changeBar = (index: number) => {
    barActiveIndex.value = index
  }

  const handleMarkAllRead = () => {
    if (!noticeStore.totalUnread) return
    void noticeStore.markAllRead()
  }

  const handleClearRead = () => {
    void noticeStore.clearRead(TAB_KINDS[barActiveIndex.value])
  }

  /** 点击：标为已读；有跳转路由则一并跳转 */
  const handleItemClick = (item: Api.Notify.NotificationItem) => {
    if (!item.read) void noticeStore.markRead(item.type, item.id)
    if (item.link) {
      const router = useRouter()
      router.push(item.link)
      emitClose()
    }
  }

  const emitClose = () => {
    emit('update:value', false)
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // 图标与配色（类型为后端枚举 NOTICE/MESSAGE/TODO）
  const noticeStyleMap: Record<TabKind, NoticeStyle> = {
    NOTICE: { icon: 'ri:notification-3-line', iconClass: 'bg-theme/12 text-theme' },
    MESSAGE: { icon: 'ri:message-3-line', iconClass: 'bg-success/12 text-success' },
    TODO: { icon: 'ri:todo-line', iconClass: 'bg-warning/12 text-warning' }
  }

  const getNoticeStyle = (type: TabKind): NoticeStyle =>
    noticeStyleMap[type] ?? {
      icon: 'ri:arrow-right-circle-line',
      iconClass: 'bg-theme/12 text-theme'
    }

  // 开合动画
  const showNotice = (open: boolean) => {
    if (open) {
      visible.value = true
      setTimeout(() => {
        show.value = true
      }, 5)
    } else {
      show.value = false
      setTimeout(() => {
        visible.value = false
      }, 350)
    }
  }
</script>

<style scoped>
  @reference '@styles/core/tailwind.css';

  .art-notification-panel {
    @apply absolute
    top-14.5
    right-5
    w-90
    h-125
    overflow-hidden
    transition-all
    duration-300
    origin-top
    will-change-[top,left]
    max-[640px]:top-[65px]
    max-[640px]:right-0
    max-[640px]:w-full
    max-[640px]:h-[80vh];
  }

  .bar-active {
    color: var(--theme-color) !important;
    border-bottom: 2px solid var(--theme-color);
  }

  .scrollbar-thin::-webkit-scrollbar {
    width: 5px !important;
  }

  .dark .scrollbar-thin::-webkit-scrollbar-track {
    background-color: var(--default-box-color);
  }

  .dark .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: #222 !important;
  }
</style>
