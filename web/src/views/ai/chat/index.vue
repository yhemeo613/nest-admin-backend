<!-- AI 问答（SSE 流式） -->
<template>
  <div class="art-full-height flex flex-col">
    <ElCard class="flex-1 overflow-hidden" shadow="never">
      <div class="flex h-full flex-col">
        <!-- 消息列表 -->
        <div ref="listRef" class="flex-1 overflow-y-auto pr-2">
          <template v-if="messages.length">
            <div
              v-for="(m, i) in messages"
              :key="i"
              class="mb-4 flex"
              :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[75%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm leading-6"
                :class="
                  m.role === 'user'
                    ? 'bg-[var(--main-color)] text-white'
                    : 'bg-[var(--art-gray-100)] text-[var(--art-gray-900)]'
                "
              >
                {{ m.content }}<span v-if="m.loading" class="ml-1 animate-pulse">▌</span>
              </div>
            </div>
          </template>
          <div v-else class="flex h-full items-center justify-center text-sm text-g-500">
            输入问题开始对话（后端 SSE 流式转发大模型回答）
          </div>
        </div>

        <!-- 输入区 -->
        <div class="mt-3 border-t border-g-200 pt-3">
          <div class="flex gap-2">
            <ElInput
              v-model="input"
              type="textarea"
              :rows="2"
              resize="none"
              placeholder="输入消息，Enter 发送（Shift+Enter 换行）"
              @keydown.enter.exact.prevent="send"
            />
            <ElButton
              :type="streaming ? 'danger' : 'primary'"
              :disabled="!streaming && !input.trim()"
              @click="streaming ? stop() : send()"
              v-ripple
            >
              {{ streaming ? '停止' : '发送' }}
            </ElButton>
          </div>
        </div>
      </div>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { useUserStore } from '@/store/modules/user'
  import { ElMessage } from 'element-plus'

  defineOptions({ name: 'AiChat' })

  interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
    loading?: boolean
  }

  const userStore = useUserStore()
  const input = ref('')
  const streaming = ref(false)
  const messages = ref<ChatMessage[]>([])
  const listRef = ref<HTMLElement>()
  let abortController: AbortController | null = null

  const scrollToBottom = () => {
    nextTick(() => {
      listRef.value?.scrollTo({ top: listRef.value.scrollHeight })
    })
  }

  /**
   * SSE 流式对话：POST fetch + ReadableStream 解析。
   * 不走 axios 封装（其响应拦截器面向 JSON），由这里直接消费 text/event-stream。
   * 帧格式：data: {"delta":"...","done":false}；结束帧 done:true 附带 usage。
   */
  const send = async () => {
    const text = input.value.trim()
    if (!text || streaming.value) return

    input.value = ''
    messages.value.push({ role: 'user', content: text })
    const reply: ChatMessage = reactive({ role: 'assistant', content: '', loading: true })
    messages.value.push(reply)
    scrollToBottom()

    streaming.value = true
    abortController = new AbortController()

    try {
      const res = await fetch('/api/v1/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userStore.accessToken}`
        },
        body: JSON.stringify({ message: text }),
        signal: abortController.signal
      })

      if (!res.ok || !res.body) {
        // HTTP 错误（401/403/5xx）返回 JSON 错误结构
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

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE 帧以空行分隔，data: 开头
        let sep: number
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const delta = JSON.parse(payload) as {
                delta?: string
                done?: boolean
                code?: number
                message?: string
              }
              if (delta.code) throw new Error(delta.message || 'AI 调用失败')
              if (delta.delta) {
                reply.content += delta.delta
                scrollToBottom()
              }
            } catch {
              /* 忽略无法解析的帧 */
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        reply.content += '\n[已停止]'
      } else {
        ElMessage.error((error as Error).message || 'AI 调用失败')
        if (!reply.content) reply.content = '[调用失败]'
      }
    } finally {
      reply.loading = false
      streaming.value = false
      abortController = null
      scrollToBottom()
    }
  }

  const stop = () => abortController?.abort()

  onBeforeUnmount(() => abortController?.abort())
</script>
