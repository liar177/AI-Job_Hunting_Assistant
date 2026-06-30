<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import { renderMarkdown, downloadMarkdown, cleanLegacyDocStyleNoiseFromMarkdown } from '@/utils/markdown'
import { formatDate } from '@/utils/constants'
import { ArrowLeft, Save, FileDown, FileText, Pencil, Check, X, Eye } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const store = useResumeStore()

const titleEditing = ref(false)
const titleInput = ref('')
const content = ref('')
const toastMessage = ref('')
let toastTimer: ReturnType<typeof window.setTimeout> | undefined

const renderedHtml = computed(() => renderMarkdown(content.value))

function showToast(message: string) {
  toastMessage.value = message
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastMessage.value = ''
  }, 2200)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function loadResumeData(id: string) {
  const resume = store.loadResume(id)
  if (!resume) {
    router.push('/resumes')
    return
  }
  titleInput.value = resume.title
  content.value = cleanLegacyDocStyleNoiseFromMarkdown(resume.content)
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
  showToast('保存成功')
}

function exportMd() {
  if (!store.currentResume) return
  downloadMarkdown(content.value, `${store.currentResume.title}.md`)
  showToast('Markdown 已开始下载')
}

function exportPdf() {
  if (!store.currentResume) return
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    showToast('无法打开 PDF 导出窗口，请检查浏览器弹窗设置')
    return
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(store.currentResume.title)}</title>
        <style>
          body {
            margin: 0;
            padding: 32px 42px;
            color: #24292f;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif;
            font-size: 15px;
            line-height: 1.72;
          }
          h1, h2, h3, h4, h5, h6 {
            margin: 1.25em 0 0.6em;
            color: #111827;
            font-weight: 700;
            line-height: 1.28;
          }
          h1 { padding-bottom: 0.28em; border-bottom: 1px solid #e5e7eb; font-size: 2em; }
          h2 { padding-bottom: 0.22em; border-bottom: 1px solid #edf0f3; font-size: 1.6em; }
          h3 { font-size: 1.3em; }
          h4 { font-size: 1.12em; }
          h5 { font-size: 1em; }
          h6 { color: #6b7280; font-size: 0.9em; }
          p { margin: 0 0 1em; }
          ul, ol { margin: 0 0 1em; padding-left: 1.6em; }
          li { margin: 0.3em 0; }
          blockquote { margin: 1em 0; padding-left: 1em; border-left: 4px solid #d0d7de; color: #57606a; }
          code { padding: 0.15em 0.35em; border-radius: 4px; background: #f3f4f6; color: #be123c; }
          pre { padding: 14px; overflow-x: auto; border-radius: 8px; background: #f6f8fa; }
          pre code { padding: 0; background: transparent; color: inherit; }
          table { width: 100%; margin: 1em 0; border-collapse: collapse; }
          th, td { padding: 8px 10px; border: 1px solid #d0d7de; }
          th { background: #f6f8fa; }
          @page { margin: 18mm; }
        </style>
      </head>
      <body>${renderedHtml.value}</body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  showToast('已打开 PDF 导出窗口，请选择另存为 PDF')
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
          class="markdown-body flex-1 overflow-auto"
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
          @click="exportPdf"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <FileDown class="w-4 h-4" />
          导出 PDF
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

    <div
      v-if="toastMessage"
      class="fixed top-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
    >
      {{ toastMessage }}
    </div>
  </div>
</template>
