<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import { readFile } from '@/utils/markdown'
import { formatDate } from '@/utils/constants'
import { useBackdropClose } from '@/composables/useBackdropClose'
import { ElMessage, ElMessageBox } from 'element-plus/es'
import { FileText, Plus, Eye, Trash2, Upload, X, Wand2 } from 'lucide-vue-next'
import type { Resume } from '@/types'

const router = useRouter()
const store = useResumeStore()

// 新建模态框状态
const showModal = ref(false)
const newTitle = ref('')
const newContent = ref('')

// 文件导入
const fileInput = ref<HTMLInputElement | null>(null)

function getFileSourceType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (extension === 'txt') return 'txt'
  if (extension === 'doc') return 'doc'
  if (extension === 'docx') return 'docx'
  if (extension === 'pdf') return 'pdf'
  return 'manual'
}

function sourceTypeLabel(resume: Resume): string {
  const sourceType = (resume as Resume & { sourceType?: string }).sourceType || 'manual'
  const labels: Record<string, string> = {
    manual: '手动',
    markdown: 'MD',
    txt: 'TXT',
    doc: 'DOC',
    docx: 'DOCX',
    pdf: 'PDF',
  }
  return labels[sourceType] || sourceType.toUpperCase()
}

onMounted(() => {
  store.loadResumes()
})

function openModal() {
  newTitle.value = ''
  newContent.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

const createResumeBackdrop = useBackdropClose(closeModal)

async function createResume() {
  const title = newTitle.value.trim()
  if (!title) return
  const content = newContent.value
  const resume = await store.createResume({ title, content, originalContent: content, sourceType: 'manual' })
  showModal.value = false
  router.push(`/resumes/${resume.id}`)
}

function viewDetail(resume: Resume) {
  router.push(`/resumes/${resume.id}`)
}

function goToCustomize(resume: Resume) {
  router.push(`/customize?resumeId=${resume.id}`)
}

function handleDelete(resume: Resume) {
  ElMessageBox.confirm(
    `确定删除简历"${resume.title}"吗？此操作不可恢复。`,
    '确认删除',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    await store.deleteResume(resume.id)
    ElMessage.success('删除成功')
  }).catch(() => {})
}

function triggerImport() {
  fileInput.value?.click()
}

async function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const content = await readFile(file)
    const title = file.name.replace(/\.(md|markdown|txt|doc|docx|pdf)$/i, '')
    const resume = await store.createResume({
      title,
      content,
      originalContent: content,
      sourceType: getFileSourceType(file.name),
    })
    router.push(`/resumes/${resume.id}`)
  } catch {
    ElMessage.error('文件读取失败，请重试')
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

function preview(content: string): string {
  return content.slice(0, 100)
}
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- 顶部标题栏 -->
    <header class="flex items-center justify-between px-8 py-6 bg-white border-b border-gray-100">
      <div>
        <h1 class="text-2xl font-semibold text-primary">简历管理</h1>
        <p class="text-sm text-gray-500 mt-1">管理你的多份简历，快速投递</p>
      </div>
      <div class="flex items-center gap-2">
        <input
          ref="fileInput"
          type="file"
          accept=".md,.markdown,.txt,.doc,.docx,.pdf,application/msword,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          class="hidden"
          @change="handleFileChange"
        />
        <button
          @click="triggerImport"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <Upload class="w-4 h-4" />
          导入文件
        </button>
        <button
          @click="openModal"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          新建简历
        </button>
      </div>
    </header>

    <!-- 内容区 -->
    <main class="flex-1 overflow-auto px-8 py-6">
      <!-- 空状态 -->
      <div
        v-if="store.resumes.length === 0"
        class="flex flex-col items-center justify-center py-24"
      >
        <div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <FileText class="w-10 h-10 text-gray-400" />
        </div>
        <h3 class="text-lg font-medium text-gray-700">还没有简历</h3>
        <p class="text-sm text-gray-500 mt-1 mb-6">新建一份简历或从文件导入开始</p>
        <div class="flex items-center gap-3">
          <button
            @click="triggerImport"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Upload class="w-4 h-4" />
            导入文件
          </button>
          <button
            @click="openModal"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus class="w-4 h-4" />
            新建简历
          </button>
        </div>
      </div>

      <!-- 简历卡片列表 -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <article
          v-for="resume in store.resumes"
          :key="resume.id"
          class="bg-white rounded-xl border border-gray-100 p-5 flex flex-col hover:shadow-md transition-shadow"
        >
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex items-start gap-3 min-w-0">
              <div class="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                <FileText class="w-5 h-5 text-primary" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                  <h3 class="font-medium text-gray-800 truncate">{{ resume.title }}</h3>
                  <span class="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-gray-500">
                    {{ sourceTypeLabel(resume) }}
                  </span>
                </div>
                <p class="text-xs text-gray-400 mt-0.5">v{{ resume.version }} · {{ formatDate(resume.updatedAt) }}</p>
              </div>
            </div>
          </div>

          <p class="text-sm text-gray-500 line-clamp-3 flex-1 mb-4 whitespace-pre-wrap break-words">
            {{ preview(resume.content) || '（空简历）' }}
          </p>

          <div class="flex items-center gap-2 pt-3 border-t border-gray-50">
            <button
              @click="goToCustomize(resume)"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent-dark transition-colors"
            >
              <Wand2 class="w-3.5 h-3.5" />
              定制简历
            </button>
            <button
              @click="viewDetail(resume)"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <Eye class="w-3.5 h-3.5" />
              查看详情
            </button>
            <button
              @click="handleDelete(resume)"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-red-600 text-xs font-medium hover:bg-red-50 transition-colors ml-auto"
            >
              <Trash2 class="w-3.5 h-3.5" />
              删除
            </button>
          </div>
        </article>
      </div>
    </main>

    <!-- 新建简历模态框 -->
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @pointerdown="createResumeBackdrop.onBackdropPointerDown"
      @pointerup="createResumeBackdrop.onBackdropPointerUp"
      @pointercancel="createResumeBackdrop.onBackdropPointerCancel"
      @click="createResumeBackdrop.onBackdropClick"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-800">新建简历</h2>
          <button
            @click="closeModal"
            class="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="px-6 py-5 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">简历标题</label>
            <el-input
              v-model="newTitle"
              placeholder="例如：Java后端工程师简历"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">简历内容</label>
            <el-input
              v-model="newContent"
              type="textarea"
              :rows="10"
              class="font-mono"
              placeholder="粘贴或输入简历内容，支持 Markdown 语法..."
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            @click="closeModal"
            class="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-white transition-colors"
          >
            取消
          </button>
          <button
            @click="createResume"
            :disabled="!newTitle.trim()"
            class="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存并编辑
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
