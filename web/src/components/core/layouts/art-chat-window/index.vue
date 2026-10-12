<!-- 米答 · AI 智能助手（气泡/打字指示/快捷回复/失败重试，参考阿里 ChatUI） -->
<template>
  <div>
    <ElDrawer v-model="isDrawerVisible" :size="isMobile ? '100%' : '480px'" :with-header="false">
      <!-- 头部：名称 + 状态 + 操作 -->
      <div class="mb-4 flex-cb">
        <div class="flex items-center gap-2.5">
          <div class="relative">
            <ElAvatar :size="36" :src="aiAvatar" />
            <span
              class="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-white"
              :class="streaming ? 'bg-warning' : 'bg-success'"
            />
          </div>
          <div>
            <span class="text-base font-medium">{{ BOT_NAME }}</span>
            <div class="mt-0.5 flex items-center gap-1 text-xs text-g-500">
              <span>{{ streaming ? '正在输入…' : 'AI 智能助手 · 在线' }}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <ElIcon class="c-p text-g-500" title="清空对话" @click="handleClear">
            <Delete />
          </ElIcon>
          <ElIcon class="c-p text-g-500" :size="20" @click="closeChat">
            <Close />
          </ElIcon>
        </div>
      </div>

      <div class="flex min-h-0 h-[calc(100%-76px)] flex-col">
        <!-- 消息区域 -->
        <div
          class="min-h-0 flex-1 overflow-y-auto border-t-d px-4 py-5 [&::-webkit-scrollbar]:!w-1"
          ref="messageContainer"
        >
          <!-- 系统消息（ChatUI system-message） -->
          <div class="mb-4 text-center">
            <span class="rounded bg-g-300/50 px-2 py-1 text-xs text-g-600">
              {{ BOT_NAME }}由大模型驱动，内容仅供参考
            </span>
          </div>

          <template v-for="(message, index) in messages" :key="message.id">
            <!-- 首字未到时整行交给下方打字指示，避免出现空光标框 + 打字框两个框 -->
            <div
              v-if="!isPendingStream(index)"
              class="mb-5 flex w-full items-start gap-2"
              :class="message.isMe ? 'flex-row-reverse' : 'flex-row'"
            >
              <ElAvatar :size="30" :src="message.isMe ? meAvatar : aiAvatar" class="shrink-0" />
              <div
                class="flex max-w-[78%] flex-col"
                :class="message.isMe ? 'items-end' : 'items-start'"
              >
                <!-- 气泡（Bot 走 Markdown 渲染，用户走纯文本） -->
                <div
                  class="rounded-lg px-3.5 py-2.5"
                  :class="
                    message.isMe
                      ? 'message-right bg-theme/15 text-g-900'
                      : 'message-left bg-g-300/50 text-g-900'
                  "
                >
                  <AiMarkdown
                    v-if="!message.isMe && message.content"
                    :content="message.content"
                    class="min-w-8"
                  />
                  <span v-else class="whitespace-pre-wrap text-sm leading-6">{{
                    message.content
                  }}</span>
                  <span
                    v-if="isStreamingSlot(index)"
                    class="ml-0.5 inline-block animate-pulse text-theme"
                    >▌</span
                  >
                </div>

                <!-- Agent 工具调用轨迹 -->
                <div
                  v-if="!message.isMe && message.tools?.length"
                  class="mt-1 flex flex-wrap gap-1.5"
                >
                  <span
                    v-for="(t, i) in message.tools"
                    :key="i"
                    class="inline-flex items-center gap-1 rounded-full bg-g-100 px-2 py-0.5 text-xs text-g-600"
                  >
                    <span>{{ aiToolLabel(t.name) }}</span>
                    <span v-if="t.status === 'running'" class="animate-pulse text-theme">···</span>
                    <ArtSvgIcon
                      v-else-if="t.status === 'done'"
                      icon="ri:check-line"
                      class="text-success"
                    />
                    <ArtSvgIcon v-else icon="ri:close-line" class="text-danger" />
                  </span>
                </div>

                <!-- 发送状态：失败可重试（ChatUI message-status） -->
                <div
                  v-if="message.status === 'fail'"
                  class="mt-1 flex items-center gap-2 text-xs text-danger"
                >
                  <ArtSvgIcon icon="ri:error-warning-line" />
                  <span>发送失败</span>
                  <span class="c-p underline" @click="retry">重试</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 打字指示（ChatUI typing） -->
          <div v-if="showTyping" class="mb-5 flex items-center gap-2">
            <ElAvatar :size="30" :src="aiAvatar" class="shrink-0" />
            <div class="typing-bubble flex items-center gap-1 rounded-lg bg-g-200/70 px-3.5 py-3">
              <span /><span /><span />
            </div>
          </div>
        </div>

        <!-- 快捷回复（ChatUI quickReply） -->
        <div v-if="showQuickReplies" class="flex flex-wrap gap-2 px-4 pt-3">
          <ElButton v-for="q in QUICK_REPLIES" :key="q" size="small" round plain @click="send(q)">
            {{ q }}
          </ElButton>
        </div>

        <!-- 输入区域 -->
        <div class="border-t-d px-4 pt-3 pb-4">
          <ElInput
            v-model="messageText"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 5 }"
            resize="none"
            :placeholder="streaming ? '正在回答中…' : `向${BOT_NAME}提问，Enter 发送`"
            @keydown.enter.exact.prevent="sendMessage"
            @keydown.escape="stopStream"
          />
          <div class="mt-2 flex-cb">
            <span class="text-xs text-g-400">Enter 发送 · Shift+Enter 换行</span>
            <ElButton
              v-if="streaming"
              type="danger"
              plain
              size="small"
              @click="stopStream"
              v-ripple
            >
              停止
            </ElButton>
            <ElButton
              v-else
              type="primary"
              size="small"
              :disabled="!messageText.trim()"
              @click="sendMessage"
              v-ripple
            >
              发送
            </ElButton>
          </div>
        </div>
      </div>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import AiMarkdown from '@/components/business/ai-markdown/index.vue'
  import { streamChat } from '@/utils/sse-chat'
  import { useUserStore } from '@/store/modules/user'
  import { Close, Delete } from '@element-plus/icons-vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { mittBus } from '@/utils/sys'
  import { aiToolLabel, type AiToolTrace } from '@/utils/ai-tools'
  import meAvatar from '@/assets/images/avatar/avatar5.webp'
  import aiAvatar from '@/assets/images/avatar/avatar10.webp'

  defineOptions({ name: 'ArtChatWindow' })

  interface ChatMessage {
    id: string
    isMe: boolean
    content: string
    time: string
    /** streaming：流式中；fail：失败（可重试）；ok：完成 */
    status: 'streaming' | 'fail' | 'ok'
    /** Agent 工具调用轨迹（SSE tool 帧） */
    tools?: AiToolTrace[]
  }

  const BOT_NAME = '米答'
  const MOBILE_BREAKPOINT = 640
  const MAX_MESSAGES = 60

  const QUICK_REPLIES = ['你能做什么？', '介绍一下这个系统', '如何重置密码？', '帮我写一段 SQL']

  const userStore = useUserStore()
  const userId = computed(() => userStore.info?.userId || 'default')
  const storageKey = computed(() => `mida:messages:${userId.value}`)

  const { width } = useWindowSize()
  const isMobile = computed(() => width.value < MOBILE_BREAKPOINT)

  const isDrawerVisible = ref(false)
  const messageText = ref('')
  const messages = ref<ChatMessage[]>([])
  const streaming = ref(false)
  const messageContainer = ref<HTMLElement | null>(null)
  let abortController: AbortController | null = null

  // ---------- 持久化（本地保存最近会话） ----------
  const loadMessages = () => {
    try {
      const raw = localStorage.getItem(storageKey.value)
      messages.value = raw ? (JSON.parse(raw) as ChatMessage[]) : []
      // 重载时把中断的流式消息标记为失败态
      messages.value.forEach((m) => {
        if (m.status === 'streaming') m.status = 'ok'
      })
    } catch {
      messages.value = []
    }
  }

  const persistMessages = () => {
    try {
      localStorage.setItem(storageKey.value, JSON.stringify(messages.value.slice(-MAX_MESSAGES)))
    } catch {
      /* 超额/隐私模式下静默失败 */
    }
  }
  watchDebounced(messages, persistMessages, { deep: true, debounce: 400 })

  // ---------- 渲染辅助 ----------
  const showTyping = computed(() => {
    if (!streaming.value) return false
    const last = messages.value[messages.value.length - 1]
    return Boolean(last && !last.isMe && !last.content)
  })

  const showQuickReplies = computed(() => !streaming.value && messages.value.every((m) => m.isMe))

  const isStreamingSlot = (index: number) =>
    streaming.value && index === messages.value.length - 1 && !messages.value[index].isMe

  /** 流式回复尚未产出首字：此时隐藏该行，由打字指示占位（避免双框） */
  const isPendingStream = (index: number) => {
    const m = messages.value[index]
    return isStreamingSlot(index) && m.status === 'streaming' && !m.content
  }

  const formatCurrentTime = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const scrollToBottom = () => {
    nextTick(() => {
      if (messageContainer.value)
        messageContainer.value.scrollTop = messageContainer.value.scrollHeight
    })
  }

  // ---------- 发送与流式 ----------
  const send = (text: string) => {
    const content = text.trim()
    if (!content || streaming.value) return
    messages.value.push({
      id: `${Date.now()}-u`,
      isMe: true,
      content,
      time: formatCurrentTime(),
      status: 'ok'
    })
    messageText.value = ''
    void runStream(content)
  }

  const sendMessage = () => send(messageText.value)

  const runStream = async (text: string) => {
    // 历史：本次用户消息之前的内容（多轮意图理解）
    const history = messages.value
      .filter((m) => m.content)
      .slice(-20)
      .map((m) => ({
        role: (m.isMe ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content
      }))
    const reply: ChatMessage = {
      id: `${Date.now()}-a`,
      isMe: false,
      content: '',
      time: formatCurrentTime(),
      status: 'streaming'
    }
    messages.value.push(reply)
    streaming.value = true
    scrollToBottom()

    abortController = new AbortController()
    try {
      await streamChat({
        message: text,
        token: userStore.accessToken,
        signal: abortController.signal,
        history: history.length ? history : undefined,
        onTool: (t) => {
          const trace = reply.tools ?? (reply.tools = [])
          const last = trace[trace.length - 1]
          if (t.status === 'running') {
            if (!(last && last.name === t.name && last.status === 'running')) trace.push({ ...t })
          } else if (last && last.name === t.name) {
            last.status = t.status
          }
          scrollToBottom()
        },
        onDelta: (delta) => {
          reply.content += delta
          scrollToBottom()
        }
      })
      reply.status = 'ok'
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        reply.content = reply.content ? `${reply.content}\n\n[已停止]` : '[已停止]'
        reply.status = 'ok'
      } else {
        reply.status = 'fail'
        if (!reply.content) {
          // 内容为空时把错误信息展示给用户
          reply.content = (error as Error).message || 'AI 调用失败'
        }
        ElMessage.error((error as Error).message || 'AI 调用失败')
      }
    } finally {
      streaming.value = false
      abortController = null
      scrollToBottom()
      persistMessages()
    }
  }

  /** 失败重试：移除失败的回复，重新发送上一条用户消息 */
  const retry = () => {
    if (streaming.value) return
    const lastUser = [...messages.value].reverse().find((m) => m.isMe)
    if (!lastUser) return
    // 去掉尾部失败的助手消息
    while (messages.value.length && !messages.value[messages.value.length - 1].isMe) {
      messages.value.pop()
    }
    void runStream(lastUser.content)
  }

  const stopStream = () => abortController?.abort()

  // ---------- 窗口控制 ----------
  const handleClear = async () => {
    if (!messages.value.length) return
    await ElMessageBox.confirm('清空当前对话记录？', '清空对话', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
    stopStream()
    messages.value = []
    persistMessages()
  }

  const openChat = () => {
    isDrawerVisible.value = true
    scrollToBottom()
  }

  const closeChat = () => {
    isDrawerVisible.value = false
  }

  onMounted(() => {
    loadMessages()
    mittBus.on('openChat', openChat)
  })

  onUnmounted(() => {
    mittBus.off('openChat', openChat)
    stopStream()
  })
</script>

<style lang="scss" scoped>
  .typing-bubble {
    span {
      width: 6px;
      height: 6px;
      background: var(--art-gray-500);
      border-radius: 50%;
      animation: mida-typing 1.2s infinite ease-in-out;

      &:nth-child(2) {
        animation-delay: 0.15s;
      }

      &:nth-child(3) {
        animation-delay: 0.3s;
      }
    }
  }

  @keyframes mida-typing {
    0%,
    60%,
    100% {
      opacity: 0.5;
      transform: translateY(0);
    }

    30% {
      opacity: 1;
      transform: translateY(-4px);
    }
  }
</style>
