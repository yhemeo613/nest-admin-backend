<!-- AI 问答：Open WebUI 风格（会话侧栏 / Markdown 流式 / 模型选择 / 快捷键） -->
<template>
  <div class="art-full-height relative overflow-hidden">
    <!-- 移动端遮罩 -->
    <div
      v-if="sidebarOpen && isSmallScreen"
      class="fixed inset-0 z-10 bg-black/30"
      @click="sidebarOpen = false"
    />

    <!-- art-full-height 自带纵向 flex，内层再开横向布局 -->
    <div class="flex min-h-0 w-full flex-1">
      <ChatSidebar
        v-show="sidebarOpen"
        ref="sidebarRef"
        class="max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:shadow-lg"
        :sessions="sessions"
        :active-id="activeId"
        @create="newSession"
        @select="selectSession"
        @rename="renameSession"
        @delete="deleteSession"
      />

      <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-[#18191a]">
        <!-- 顶栏 -->
        <header
          class="flex h-12 shrink-0 items-center gap-3 border-b border-g-200 px-4 dark:border-g-300"
        >
          <ElButton circle text @click="sidebarOpen = !sidebarOpen" title="会话列表">
            <ElIcon :size="18"><Expand v-if="!sidebarOpen" /><Fold v-else /></ElIcon>
          </ElButton>
          <div class="min-w-0 flex-1 truncate text-sm font-medium">
            {{ activeSession?.title ?? '新对话' }}
          </div>
          <ElSelect
            v-model="selectedModelId"
            class="!w-56"
            size="small"
            placeholder="默认模型"
            :disabled="streaming"
          >
            <ElOption
              v-for="m in models"
              :key="m.id"
              :label="`${m.label}（${m.providerName}）`"
              :value="m.id"
            />
          </ElSelect>
        </header>

        <!-- 消息区 -->
        <div ref="scrollRef" class="min-h-0 flex-1 overflow-y-auto" @scroll="onScroll">
          <!-- 欢迎页（无消息） -->
          <div
            v-if="!activeMessages.length"
            class="flex h-full flex-col items-center justify-center gap-6 px-4 py-10"
          >
            <div class="text-center">
              <ArtSvgIcon
                icon="ri:sparkling-2-fill"
                class="mb-3 text-[44px] text-[var(--main-color)]"
              />
              <h2 class="text-xl font-semibold text-g-800">有什么可以帮你？</h2>
              <p class="mt-1 text-sm text-g-500">大模型可能犯错，请核实重要信息</p>
            </div>
            <div class="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
              <div
                v-for="s in SUGGESTIONS"
                :key="s.title"
                class="cursor-pointer rounded-xl border border-g-200 bg-white p-4 shadow-sm transition-all hover:border-[var(--main-color)] hover:shadow-md dark:border-g-300 dark:bg-[#202123]"
                @click="useSuggestion(s.prompt)"
              >
                <div class="mb-1 text-sm font-medium text-g-800">
                  {{ s.title }}
                </div>
                <div class="line-clamp-2 text-xs text-g-500">{{ s.prompt }}</div>
              </div>
            </div>
            <div class="w-full max-w-2xl">
              <ChatInput
                v-model="input"
                placeholder="输入消息，Enter 发送（Shift+Enter 换行）"
                :streaming="streaming"
                @send="send"
                @stop="stopStream"
              />
            </div>
          </div>

          <!-- 消息列表 -->
          <div v-else class="mx-auto w-full max-w-3xl px-4 py-6">
            <ChatMessageItem
              v-for="(m, i) in activeMessages"
              :key="m.id"
              :message="m"
              :streaming="streaming && i === activeMessages.length - 1 && m.role === 'assistant'"
              @regenerate="regenerate"
              @edit="editMessage"
            />
          </div>
        </div>

        <!-- 底部输入区 -->
        <div
          v-if="activeMessages.length"
          class="relative shrink-0 border-t border-g-200 px-4 py-3 dark:border-g-300"
        >
          <div class="mx-auto w-full max-w-3xl">
            <ChatInput
              v-model="input"
              placeholder="输入消息，Enter 发送（Shift+Enter 换行，Esc 停止）"
              :streaming="streaming"
              @send="send"
              @stop="stopStream"
            />
            <div class="mt-1.5 text-center text-xs text-g-400">
              AI 生成内容仅供参考，请核实重要信息
            </div>
          </div>
          <ElButton
            v-if="!atBottom"
            class="absolute -top-11 left-1/2 -translate-x-1/2"
            size="small"
            round
            type="primary"
            plain
            @click="scrollToBottom(true)"
          >
            <ElIcon class="mr-1"><ArrowDown /></ElIcon>回到底部
          </ElButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { fetchAiChatModels } from '@/api/ai-config'
  import { useUserStore } from '@/store/modules/user'
  import { ArrowDown, Expand, Fold } from '@element-plus/icons-vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import ChatInput from './modules/ChatInput.vue'
  import ChatMessageItem from './modules/ChatMessageItem.vue'
  import ChatSidebar from './modules/ChatSidebar.vue'
  import {
    genId,
    loadModelId,
    loadSessions,
    saveModelId,
    saveSessions,
    titleFrom,
    type ChatMessageItem as MessageItem,
    type ChatSession
  } from './modules/session-store'

  defineOptions({ name: 'AiChat' })

  const SUGGESTIONS = [
    { title: '写一份周报', prompt: '帮我写一份本周工作周报，包含本周进展、风险和下周计划' },
    {
      title: '解释一段代码',
      prompt: '解释一下什么是防抖和节流，给出 TypeScript 实现和使用场景对比'
    },
    { title: 'SQL 排查', prompt: '一条 SQL 执行很慢，给出系统的排查步骤和优化思路' },
    { title: '接口设计', prompt: '设计一个分页查询接口的 RESTful 规范，包含入参、出参和错误码示例' }
  ]

  const userStore = useUserStore()
  const userId = computed(() => userStore.info?.userId || 'default')

  // ---------- 会话状态 ----------
  const sessions = ref<ChatSession[]>([])
  const activeId = ref('')
  const activeSession = computed(() => sessions.value.find((s) => s.id === activeId.value))
  const activeMessages = computed(() => activeSession.value?.messages ?? [])

  const persist = () => saveSessions(userId.value, sessions.value)
  // 流式过程中内容高频变化，防抖落盘
  watchDebounced(sessions, persist, { deep: true, debounce: 400 })

  const sidebarOpen = ref(true)
  const sidebarRef = ref<InstanceType<typeof ChatSidebar>>()
  const isSmallScreen = ref(false)
  const updateScreen = () => {
    isSmallScreen.value = window.innerWidth < 768
    if (isSmallScreen.value) sidebarOpen.value = false
  }
  onMounted(updateScreen)
  window.addEventListener('resize', updateScreen)
  onBeforeUnmount(() => window.removeEventListener('resize', updateScreen))

  const newSession = () => {
    stopStream()
    activeId.value = ''
    input.value = ''
  }

  const selectSession = (id: string) => {
    if (streaming.value) stopStream()
    activeId.value = id
    if (isSmallScreen.value) sidebarOpen.value = false
    nextTick(() => scrollToBottom(true))
  }

  const renameSession = async (s: ChatSession) => {
    const { value } = await ElMessageBox.prompt('对话名称', '重命名', {
      inputValue: s.title,
      inputValidator: (v: string) => (v.trim() ? true : '名称不能为空'),
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    s.title = value.trim()
    persist()
  }

  const deleteSession = async (s: ChatSession) => {
    await ElMessageBox.confirm(`删除对话「${s.title}」？该操作不可恢复。`, '删除对话', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    sessions.value = sessions.value.filter((x) => x.id !== s.id)
    if (activeId.value === s.id) activeId.value = sessions.value[0]?.id ?? ''
    persist()
  }

  // ---------- 模型选择 ----------
  const models = ref<Api.AiConfig.ChatModelItem[]>([])
  const selectedModelId = ref<string>('')
  const loadModels = async () => {
    try {
      const res = await fetchAiChatModels()
      models.value = res.list
      const stored = loadModelId(userId.value)
      selectedModelId.value =
        stored && res.list.some((m) => m.id === stored) ? stored : (res.defaultModelId ?? '')
    } catch {
      /* 无权限/接口异常时不阻塞对话（回落 env 默认模型） */
    }
  }
  watch(selectedModelId, (v) => saveModelId(userId.value, v || undefined))

  // ---------- 发送与流式 ----------
  const input = ref('')
  const streaming = ref(false)
  let abortController: AbortController | null = null

  const ensureSession = (firstText: string): ChatSession => {
    if (!activeSession.value) {
      const now = Date.now()
      const session: ChatSession = {
        id: genId(),
        title: titleFrom(firstText),
        createdAt: now,
        updatedAt: now,
        modelId: selectedModelId.value || undefined,
        messages: []
      }
      sessions.value.unshift(session)
      activeId.value = session.id
    }
    return activeSession.value!
  }

  const send = () => {
    const text = input.value.trim()
    if (!text || streaming.value) return
    input.value = ''
    ensureSession(text)
    void runStream(text, true)
  }

  const useSuggestion = (prompt: string) => {
    if (streaming.value) return
    input.value = prompt
    send()
  }

  /** appendUser=true 追加用户消息；false 用于重新生成（复用上一条用户消息） */
  const runStream = async (text: string, appendUser: boolean) => {
    const session = activeSession.value
    if (!session) return
    // 历史取自本次用户消息之前的内容（多轮上下文，最多 20 条）
    const history = session.messages
      .filter((m) => m.content)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }))
    if (appendUser) {
      session.messages.push({ id: genId(), role: 'user', content: text, createdAt: Date.now() })
    }
    const reply = reactive<MessageItem>({
      id: genId(),
      role: 'assistant',
      content: '',
      createdAt: Date.now()
    })
    session.messages.push(reply)
    session.updatedAt = Date.now()
    streaming.value = true
    scrollToBottom(true)

    abortController = new AbortController()
    try {
      const res = await fetch('/api/v1/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userStore.accessToken}`
        },
        body: JSON.stringify({
          message: text,
          ...(selectedModelId.value ? { modelId: selectedModelId.value } : {}),
          ...(history.length ? { history } : {})
        }),
        signal: abortController.signal
      })

      if (!res.ok || !res.body) {
        let message = `请求失败（HTTP ${res.status}）`
        try {
          const err = await res.json()
          if (err?.message) message = err.message
        } catch {
          /* ignore */
        }
        throw new Error(message)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finished: { usage?: MessageItem['usage']; model?: string } | null = null

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let sep: number
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const chunk = JSON.parse(payload) as {
                delta?: string
                done?: boolean
                usage?: MessageItem['usage']
                model?: string
                code?: number
                message?: string
                tool?: { name: string; status: 'running' | 'done' | 'error' }
              }
              if (chunk.code) throw new Error(chunk.message || 'AI 调用失败')
              if (chunk.tool) {
                const trace = reply.tools ?? (reply.tools = [])
                const last = trace[trace.length - 1]
                if (chunk.tool.status === 'running') {
                  if (!(last && last.name === chunk.tool.name && last.status === 'running')) {
                    trace.push({ ...chunk.tool })
                  }
                } else if (last && last.name === chunk.tool.name) {
                  last.status = chunk.tool.status
                }
                followScroll()
              }
              if (chunk.delta) {
                reply.content += chunk.delta
                followScroll()
              }
              if (chunk.done) finished = { usage: chunk.usage, model: chunk.model }
            } catch (e) {
              if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) throw e
            }
          }
        }
      }
      if (finished) {
        reply.usage = finished.usage ?? null
        reply.model = finished.model
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        reply.content = reply.content ? `${reply.content}\n\n[已停止]` : '[已停止]'
      } else {
        const msg = (error as Error).message || 'AI 调用失败'
        ElMessage.error(msg)
        reply.content = reply.content || `[调用失败：${msg}]`
      }
    } finally {
      streaming.value = false
      abortController = null
      session.updatedAt = Date.now()
      persist()
      scrollToBottom(true)
    }
  }

  const stopStream = () => abortController?.abort()

  const regenerate = (messageId: string) => {
    const session = activeSession.value
    if (!session || streaming.value) return
    const idx = session.messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    // 找到该回复之前的最后一条用户消息
    let userText = ''
    for (let i = idx - 1; i >= 0; i--) {
      if (session.messages[i].role === 'user') {
        userText = session.messages[i].content
        break
      }
    }
    if (!userText) return
    session.messages = session.messages.slice(0, idx)
    void runStream(userText, false)
  }

  const editMessage = async (messageId: string) => {
    const session = activeSession.value
    if (!session || streaming.value) return
    const idx = session.messages.findIndex((m) => m.id === messageId)
    if (idx < 0 || session.messages[idx].role !== 'user') return
    const { value } = await ElMessageBox.prompt('编辑消息', '编辑并重新发送', {
      inputValue: session.messages[idx].content,
      inputType: 'textarea',
      inputValidator: (v: string) => (v.trim() ? true : '内容不能为空'),
      confirmButtonText: '发送',
      cancelButtonText: '取消'
    })
    session.messages = session.messages.slice(0, idx)
    input.value = ''
    ensureSession(value.trim())
    void runStream(value.trim(), true)
  }

  // ---------- 滚动 ----------
  const scrollRef = ref<HTMLElement>()
  const atBottom = ref(true)

  const onScroll = () => {
    const el = scrollRef.value
    if (!el) return
    atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  /** 流式跟随：仅在用户位于底部时自动滚动（Open WebUI 同款行为） */
  const followScroll = () => {
    if (!atBottom.value) return
    nextTick(() => {
      const el = scrollRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  const scrollToBottom = (force = false) => {
    if (force) atBottom.value = true
    nextTick(() => {
      const el = scrollRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  // ---------- 快捷键（参考 Open WebUI） ----------
  const onKeydown = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey
    // Ctrl/Cmd + Shift + O：新对话
    if (mod && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
      e.preventDefault()
      newSession()
      return
    }
    // Ctrl/Cmd + K：聚焦搜索
    if (mod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault()
      sidebarOpen.value = true
      nextTick(() => sidebarRef.value?.focusSearch())
      return
    }
    // Esc：停止生成
    if (e.key === 'Escape' && streaming.value) {
      e.stopPropagation()
      stopStream()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    sessions.value = loadSessions(userId.value)
    activeId.value = sessions.value[0]?.id ?? ''
    loadModels()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    stopStream()
    persist()
  })
</script>
