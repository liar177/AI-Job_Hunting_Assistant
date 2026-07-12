<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import { renderMarkdown, downloadMarkdown, downloadPdf, cleanLegacyDocStyleNoiseFromMarkdown } from '@/utils/markdown'
import { formatDate } from '@/utils/constants'
import { showSuccess, showError } from '@/utils/message'
import { ArrowLeft, Save, FileDown, FileText, Pencil, Check, X, Eye } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const store = useResumeStore()

const titleEditing = ref(false)
const titleInput = ref('')
const content = ref('')

const renderedHtml = computed(() => renderMarkdown(content.value))

async function loadResumeData(id: string) {
  const resume = await store.loadResume(id)
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

async function saveTitle() {
  if (!store.currentResume) return
  const t = titleInput.value.trim()
  if (!t) return
  await store.updateResume(store.currentResume.id, { title: t })
  titleEditing.value = false
}

function cancelEditTitle() {
  if (!store.currentResume) return
  titleInput.value = store.currentResume.title
  titleEditing.value = false
}

async function saveResume() {
  if (!store.currentResume) return
  await store.updateResume(store.currentResume.id, { content: content.value })
  showSuccess('保存成功')
}

async function exportMd() {
  if (!store.currentResume) return
  try {
    const savedPath = await downloadMarkdown(content.value, `${store.currentResume.title}.md`)
    if (savedPath === null) return
    showSuccess(savedPath ? `Markdown 已导出：${savedPath}` : 'Markdown 已开始下载')
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Markdown 导出失败')
  }
}

async function exportPdf() {
  if (!store.currentResume) return
  try {
    const savedPath = await downloadPdf(content.value, `${store.currentResume.title}.pdf`, store.currentResume.title)
    if (savedPath === null) return
    showSuccess(savedPath ? `PDF 已导出：${savedPath}` : '已打开 PDF 导出窗口，请选择另存为 PDF')
  } catch (error) {
    showError(error instanceof Error ? error.message : 'PDF 导出失败')
  }
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
          <el-input
            v-model="titleInput"
            class="flex-1"
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
        <el-input
          v-model="content"
          type="textarea"
          class="flex-1 font-mono"
          placeholder="在此输入 Markdown 内容..."
        />
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
  </div>
</template>
