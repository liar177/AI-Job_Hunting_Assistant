<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import { useAIStore } from '@/stores/ai'
import type { Resume } from '@/types'
import { showSuccess } from '@/utils/message'
import { downloadMarkdown, downloadText, renderMarkdown } from '@/utils/markdown'
import {
  FileText, Briefcase, Sparkles, Loader2,
  AlertCircle, Settings as SettingsIcon,
  Eye, Save, FileDown, Send, X,
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const resumeStore = useResumeStore()
const aiStore = useAIStore()

const selectedResumeId = ref('')
const companyName = ref('')
const jobTitle = ref('')
const jobDescription = ref('')
const companyInfo = ref('')
const generatedContent = ref('')
const errorMsg = ref('')
const savedSuccess = ref(false)
const savedResumeId = ref('')
const activeTab = ref<'preview' | 'source'>('preview')
const showApiKeyWarning = ref(true)

const selectedResume = computed(() =>
  resumeStore.resumes.find((r) => r.id === selectedResumeId.value)
)
const hasApiKey = computed(() => !!aiStore.config.apiKey)
const canGenerate = computed(() =>
  !!selectedResume.value &&
  !!companyName.value.trim() &&
  !!jobTitle.value.trim() &&
  !!jobDescription.value.trim() &&
  hasApiKey.value
)
const renderedPreview = computed(() => renderMarkdown(generatedContent.value))

// 获取简历来源类型标签
function getSourceTypeLabel(resume: Resume): string {
  const sourceType = (resume as Resume & { sourceType?: string }).sourceType || 'manual'
  const labels: Record<string, string> = {
    manual: '手动创建',
    pdf: 'PDF',
    docx: 'DOCX',
    doc: 'DOC',
    md: 'MD',
    txt: 'TXT',
  }
  return labels[sourceType] || sourceType.toUpperCase()
}

onMounted(() => {
  resumeStore.loadResumes()
  const resumeId = route.query.resumeId as string
  if (resumeId) {
    selectedResumeId.value = resumeId
  }
})

function goToSettings() {
  router.push('/settings')
}

function dismissApiKeyWarning() {
  showApiKeyWarning.value = false
}

function cleanGeneratedContent(content: string): string {
  return content
    .replace(/^```markdown\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

async function handleGenerate() {
  if (!canGenerate.value || !selectedResume.value) return
  errorMsg.value = ''
  generatedContent.value = ''
  savedSuccess.value = false
  savedResumeId.value = ''
  activeTab.value = 'preview'

  const result = await aiStore.generate({
    resumeContent: selectedResume.value.content,
    jobDescription: jobDescription.value,
    companyInfo: companyInfo.value,
  })

  if (result.success) {
    generatedContent.value = result.content
    activeTab.value = 'preview'
  } else {
    errorMsg.value = result.error || '生成失败'
  }
}

function saveAsNewResume() {
  if (!generatedContent.value) return

  const cleanContent = cleanGeneratedContent(generatedContent.value)
  const title = `${companyName.value}-${jobTitle.value}-定制简历`
  const newResume = resumeStore.createResume({
    title,
    content: cleanContent,
    originalContent: cleanContent,
  })
  savedResumeId.value = newResume.id
  savedSuccess.value = true
  showSuccess('已保存为新简历')
}

function goToApplication() {
  if (!generatedContent.value || !savedSuccess.value || !savedResumeId.value) return

  router.push(`/applications?companyName=${encodeURIComponent(companyName.value)}&jobTitle=${encodeURIComponent(jobTitle.value)}&resumeId=${savedResumeId.value}`)
}

function updateGeneratedContent(value: string) {
  generatedContent.value = value
  savedSuccess.value = false
  savedResumeId.value = ''
}

function exportMd() {
  if (!generatedContent.value) return
  downloadMarkdown(generatedContent.value, `${companyName.value}-${jobTitle.value}-定制简历.md`)
}

function exportTxt() {
  if (!generatedContent.value) return
  downloadText(generatedContent.value, `${companyName.value}-${jobTitle.value}-定制简历.txt`)
}
</script>

<template>
  <div class="h-full min-h-0 flex flex-col bg-gray-50">
    <header class="px-5 py-5 bg-white border-b border-gray-100 lg:px-8">
      <h1 class="text-2xl font-semibold text-primary">简历定制</h1>
      <p class="text-sm text-gray-500 mt-1">选择简历、填写岗位信息，并在右侧实时查看 AI 定制结果</p>
    </header>

    <main class="flex-1 min-h-0 overflow-auto p-4 lg:overflow-hidden lg:px-8 lg:py-6">
      <div class="mx-auto flex min-h-full w-full max-w-[1440px] flex-col gap-4 lg:h-full lg:min-h-0 lg:flex-row">
        <aside class="space-y-4 lg:h-full lg:w-[42%] lg:max-w-[560px] lg:min-w-[420px] lg:overflow-auto lg:pr-1">
          <div
            v-if="!hasApiKey && showApiKeyWarning"
            class="rounded-lg border border-amber-200 bg-amber-50 p-4"
          >
            <div class="flex items-start gap-3">
              <AlertCircle class="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-amber-800">请先配置 AI API Key</p>
                <p class="mt-1 text-xs leading-5 text-amber-700">未配置时无法生成定向简历，可先完成左侧信息填写。</p>
              </div>
              <button
                type="button"
                title="关闭提示"
                class="rounded-md p-1 text-amber-700 transition-colors hover:bg-amber-100"
                @click="dismissApiKeyWarning"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              class="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700"
              @click="goToSettings"
            >
              <SettingsIcon class="h-3.5 w-3.5" />
              前往设置
            </button>
          </div>

          <section class="rounded-lg border border-gray-100 bg-white p-5">
            <div class="mb-4 flex items-center gap-2 text-sm font-medium text-gray-800">
              <FileText class="h-4 w-4 text-primary" />
              选择已有简历
            </div>

            <select
              v-model="selectedResumeId"
              class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="" disabled>请选择简历</option>
              <option v-for="r in resumeStore.resumes" :key="r.id" :value="r.id">
                {{ r.title }}（{{ getSourceTypeLabel(r) }}）
              </option>
            </select>

            <p v-if="resumeStore.resumes.length === 0" class="mt-2 text-xs text-amber-600">
              还没有简历，请先去简历管理创建。
            </p>

            <div v-if="selectedResume" class="mt-4">
              <div class="mb-2 flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-gray-500">简历内容预览</span>
                <span class="shrink-0 text-xs text-gray-400">{{ selectedResume.content.length }} 字符</span>
              </div>
              <div class="max-h-56 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-4">
                <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-gray-700">{{ selectedResume.content.slice(0, 500) }}{{ selectedResume.content.length > 500 ? '...' : '' }}</pre>
              </div>
            </div>
          </section>

          <section class="space-y-4 rounded-lg border border-gray-100 bg-white p-5">
            <div class="flex items-center gap-2 text-sm font-medium text-gray-800">
              <Briefcase class="h-4 w-4 text-primary" />
              岗位信息
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700">公司名称 *</label>
                <input
                  v-model="companyName"
                  type="text"
                  placeholder="例如：字节跳动"
                  class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700">职位名称 *</label>
                <input
                  v-model="jobTitle"
                  type="text"
                  placeholder="例如：前端工程师"
                  class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium text-gray-700">岗位描述 *</label>
              <textarea
                v-model="jobDescription"
                rows="7"
                placeholder="粘贴岗位 JD 内容..."
                class="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              ></textarea>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium text-gray-700">公司信息（可选）</label>
              <textarea
                v-model="companyInfo"
                rows="4"
                placeholder="公司规模、地点、业务、团队特点等..."
                class="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              ></textarea>
            </div>

            <button
              type="button"
              :disabled="aiStore.generating || !canGenerate"
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
              @click="handleGenerate"
            >
              <Loader2 v-if="aiStore.generating" class="h-4 w-4 animate-spin" />
              <Sparkles v-else class="h-4 w-4" />
              {{ aiStore.generating ? '生成中...' : (generatedContent ? '重新生成' : '一键生成定向简历') }}
            </button>
          </section>

          <section v-if="generatedContent" class="space-y-3 rounded-lg border border-gray-100 bg-white p-5">
            <div class="text-sm font-medium text-gray-800">生成后操作</div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                class="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
                @click="saveAsNewResume"
              >
                <Save class="h-4 w-4" />
                保存为新简历
              </button>
              <button
                type="button"
                :disabled="!savedSuccess"
                :class="[
                  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                  savedSuccess
                    ? 'bg-primary text-white hover:bg-primary-700'
                    : 'cursor-not-allowed bg-gray-100 text-gray-400',
                ]"
                @click="goToApplication"
              >
                <Send class="h-4 w-4" />
                添加到投递
              </button>
              <button
                type="button"
                class="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                @click="exportMd"
              >
                <FileDown class="h-4 w-4" />
                导出 MD
              </button>
              <button
                type="button"
                class="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                @click="exportTxt"
              >
                <FileDown class="h-4 w-4" />
                导出 TXT
              </button>
            </div>
          </section>
        </aside>

        <section class="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-lg border border-gray-100 bg-white lg:h-full lg:min-h-0">
          <div class="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                :class="[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  activeTab === 'preview' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800',
                ]"
                @click="activeTab = 'preview'"
              >
                <Eye class="h-4 w-4" />
                预览
              </button>
              <button
                type="button"
                :class="[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  activeTab === 'source' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800',
                ]"
                @click="activeTab = 'source'"
              >
                <FileText class="h-4 w-4" />
                Markdown 源码
              </button>
            </div>
            <span class="text-xs text-gray-400">{{ generatedContent.length }} 字符</span>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <div v-if="aiStore.generating" class="flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
              <Loader2 class="mb-4 h-12 w-12 animate-spin text-accent" />
              <p class="text-sm font-medium text-gray-700">AI 正在为你定制简历...</p>
              <p class="mt-1 text-xs text-gray-400">这可能需要几秒钟，请耐心等待</p>
            </div>

            <div v-else-if="errorMsg" class="p-6">
              <div class="rounded-lg border border-red-200 bg-red-50 p-5">
                <div class="mb-2 flex items-center gap-2 text-red-700">
                  <AlertCircle class="h-5 w-5" />
                  <span class="font-medium">生成失败</span>
                </div>
                <p class="whitespace-pre-wrap break-words text-sm leading-6 text-red-600">{{ errorMsg }}</p>
                <button
                  type="button"
                  :disabled="!canGenerate"
                  class="mt-4 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  @click="handleGenerate"
                >
                  重试
                </button>
              </div>
            </div>

            <div v-else-if="generatedContent" class="min-h-full">
              <div
                v-if="activeTab === 'preview'"
                class="prose-resume min-h-full max-w-none px-6 py-6 sm:px-8 lg:px-10"
                v-html="renderedPreview"
              ></div>
              <textarea
                v-else
                :value="generatedContent"
                class="h-full min-h-[520px] w-full resize-none border-0 p-5 font-mono text-sm leading-6 text-gray-800 focus:outline-none focus:ring-0"
                spellcheck="false"
                @input="updateGeneratedContent(($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </div>

            <div v-else class="flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
              <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
                <FileText class="h-8 w-8 text-primary" />
              </div>
              <p class="text-base font-medium text-gray-800">填写左侧信息并点击生成</p>
              <p class="mt-2 max-w-sm text-sm leading-6 text-gray-500">生成完成后，可在这里预览定制简历，或切换到 Markdown 源码进行微调。</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
