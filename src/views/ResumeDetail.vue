<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import { renderMarkdown, downloadMarkdown, downloadText } from '@/utils/markdown'
import { formatDate } from '@/utils/constants'
import { ArrowLeft, Save, FileDown, FileText, Pencil, Check, X, Eye } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const store = useResumeStore()

const titleEditing = ref(false)
const titleInput = ref('')
const content = ref('')

const renderedHtml = computed(() => renderMarkdown(content.value))

function loadResumeData(id: string) {
  const resume = store.loadResume(id)
  if (!resume) {
    router.push('/resumes')
    return
  }
  titleInput.value = resume.title
  content.value = resume.content
}

onMounted(() => loadResumeData(route.params.id as string))

watch(() => route.params.id, (newId) => {
  if (newId) loadResumeData(newId as string)
})

function goBack() {
  router.push('/resumes')
}

function startEditTitle() {
  if (!store.currentResume) return
  titleInput.value = store.currentResume.title
  titleEditing.value = true
}

function saveTitle() {
  if (!store.currentResume) return
  const t = titleInput.value.trim()
  if (!t) return
  store.updateResume(store.currentResume.id, { title: t })
  titleEditing.value = false
}

function cancelEditTitle() {
  if (!store.currentResume) return
  titleInput.value = store.currentResume.title
  titleEditing.value = false
}

function saveResume() {
  if (!store.currentResume) return
  store.updateResume(store.currentResume.id, { content: content.value })
}

function exportMd() {
  if (!store.currentResume) return
  downloadMarkdown(content.value, `${store.currentResume.title}.md`)
}

function exportTxt() {
  if (!store.currentResume) return
  downloadText(content.value, `${store.currentResume.title}.txt`)
}
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- 顶部栏 -->
    <header class="flex items-center gap-4 px-8 py-4 bg-white border-b border-gray-100">
      <button
        @click="goBack"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        返回
      </button>

      <div class="h-5 w-px bg-gray-200"></div>

      <!-- 标题编辑 -->
      <div class="flex-1 min-w-0 flex items-center gap-2">
        <template v-if="titleEditing">
          <input
            v-model="titleInput"
            type="text"
            class="flex-1 min-w-0 px-3 py-1.5 rounded-md border border-gray-200 text-sm font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            @keyup.enter="saveTitle"
            @keyup.esc="cancelEditTitle"
          />
          <button
            @click="saveTitle"
            class="p-1.5 rounded-md text-accent hover:bg-accent/10 transition-colors"
          >
            <Check class="w-4 h-4" />
          </button>
          <button
            @click="cancelEditTitle"
            class="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X class="w-4 h-4" />
          </button>
        </template>
        <template v-else>
          <h1 class="text-lg font-semibold text-gray-800 truncate">{{ store.currentResume?.title }}</h1>
          <button
            @click="startEditTitle"
            class="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="编辑标题"
          >
            <Pencil class="w-4 h-4" />
          </button>
        </template>
      </div>

      <div class="text-xs text-gray-400 flex items-center gap-3">
        <span v-if="store.currentResume">v{{ store.currentResume.version }}</span>
        <span v-if="store.currentResume">更新于 {{ formatDate(store.currentResume.updatedAt) }}</span>
      </div>
    </header>

    <!-- 左右分栏 -->
    <main class="flex-1 overflow-hidden flex gap-4 p-4">
      <!-- 左侧编辑器 -->
      <section class="flex-1 flex flex-col bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-600">
            <FileText class="w-4 h-4" />
            编辑器
          </div>
          <span class="text-xs text-gray-400">{{ content.length }} 字符</span>
        </div>
        <textarea
          v-model="content"
          class="flex-1 w-full p-4 text-sm font-mono text-gray-800 resize-none focus:outline-none"
          placeholder="在此输入 Markdown 内容..."
        ></textarea>
      </section>

      <!-- 右侧预览 -->
      <section class="flex-1 flex flex-col bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-600">
            <Eye class="w-4 h-4" />
            预览
          </div>
        </div>
        <div
          class="flex-1 overflow-auto p-4 prose prose-sm max-w-none"
          v-html="renderedHtml"
        ></div>
      </section>
    </main>

    <!-- 底部操作栏 -->
    <footer class="flex items-center justify-between px-8 py-3 bg-white border-t border-gray-100">
      <div class="text-xs text-gray-400">
        <span v-if="store.currentResume">创建于 {{ formatDate(store.currentResume.createdAt) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="exportMd"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <FileDown class="w-4 h-4" />
          导出 Markdown
        </button>
        <button
          @click="exportTxt"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <FileDown class="w-4 h-4" />
          导出 TXT
        </button>
        <button
          @click="saveResume"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dark transition-colors"
        >
          <Save class="w-4 h-4" />
          保存
        </button>
      </div>
    </footer>
  </div>
</template>
