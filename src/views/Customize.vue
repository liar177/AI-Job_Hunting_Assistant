<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter, useRoute } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import { useAIStore } from '@/stores/ai'
import type { Resume } from '@/types'
import { db } from '@/utils/db-adapter'
import { showError, showSuccess } from '@/utils/message'
import { downloadMarkdown, downloadText, renderMarkdown } from '@/utils/markdown'
import {
  cleanSelfIntroductionContent,
  formatSelfIntroductionDuration,
} from '@/utils/self-introduction'
import { ArrowDown,ArrowUp } from '@element-plus/icons-vue'
import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Clipboard,
  Eye,
  FileDown,
  FileText,
  ListTodo,
  Loader2,
  Mic2,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  Tags,
  Wand2,
  X,
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const resumeStore = useResumeStore()
const aiStore = useAIStore()

const {
  customizeSelectedResumeId: selectedResumeId,
  customizeCompanyName: companyName,
  customizeJobTitle: jobTitle,
  customizeJobDescription: jobDescription,
  customizeCompanyInfo: companyInfo,
  customizeOptimizationBasis: optimizationBasis,
  customizeAnalysisError: analysisError,
  customizeBasisStale: basisStale,
  customizeGeneratedContent: generatedContent,
  customizeErrorMsg: errorMsg,
  customizeSelfIntroductionDirection: selfIntroductionDirection,
  customizeGeneratedSelfIntroduction: generatedSelfIntroduction,
  customizeIntroductionError: introductionError,
  customizeIntroductionStale: introductionStale,
  customizeIntroductionUsedBasis: introductionUsedBasis,
  customizeSavedSuccess: savedSuccess,
  customizeSavedResumeId: savedResumeId,
  customizeActiveTab: activeTab,
  customizeIntroductionActiveTab: introductionActiveTab,
  customizeActiveResult: activeResult,
  customizeShowApiKeyWarning: showApiKeyWarning,
  customizeExpandedBasisSections: expandedBasisSections,
} = storeToRefs(aiStore)

const selectedResume = computed(() =>
  resumeStore.resumes.find((r) => r.id === selectedResumeId.value)
)
const hasApiKey = computed(() => !!aiStore.config.apiKey)
const canWork = computed(() =>
  !!selectedResume.value &&
  !!companyName.value.trim() &&
  !!jobTitle.value.trim() &&
  !!jobDescription.value.trim() &&
  hasApiKey.value
)
const isBusy = computed(() =>
  aiStore.analyzing || aiStore.generating || aiStore.generatingIntroduction
)
const renderedPreview = computed(() => renderMarkdown(generatedContent.value))
const fitScoreWidth = computed(() => `${optimizationBasis.value?.fitScore || 0}%`)
const activeResultLength = computed(() =>
  activeResult.value === 'resume'
    ? generatedContent.value.length
    : generatedSelfIntroduction.value.length
)
const introductionDuration = computed(() =>
  formatSelfIntroductionDuration(generatedSelfIntroduction.value)
)
const introductionDirectionStatus = computed(() =>
  selfIntroductionDirection.value.trim() ? '自定义方向' : '默认方向'
)
const generationLoadingText = computed(() =>
  optimizationBasis.value
    ? 'AI 正在根据优化依据生成简历...'
    : 'AI 正在生成定制简历...'
)

const basisSections = computed(() => {
  const basis = optimizationBasis.value
  return [
    {
      title: '已匹配优势',
      icon: CheckCircle2,
      items: basis?.matchedAdvantages || [],
      classes: 'border-emerald-100 bg-emerald-50 text-emerald-800',
      iconClasses: 'bg-emerald-100 text-emerald-700',
    },
    {
      title: '缺少或较弱能力',
      icon: AlertTriangle,
      items: basis?.weakPoints || [],
      classes: 'border-amber-100 bg-amber-50 text-amber-800',
      iconClasses: 'bg-amber-100 text-amber-700',
    },
    {
      title: '可迁移经历',
      icon: RefreshCw,
      items: basis?.transferableExperience || [],
      classes: 'border-sky-100 bg-sky-50 text-sky-800',
      iconClasses: 'bg-sky-100 text-sky-700',
    },
    {
      title: '关键词策略',
      icon: Tags,
      items: basis?.keywordStrategy || [],
      classes: 'border-indigo-100 bg-indigo-50 text-indigo-800',
      iconClasses: 'bg-indigo-100 text-indigo-700',
    },
    {
      title: '修改策略',
      icon: ListTodo,
      items: basis?.rewriteStrategy || [],
      classes: 'border-cyan-100 bg-cyan-50 text-cyan-800',
      iconClasses: 'bg-cyan-100 text-cyan-700',
    },
    {
      title: '风险提示',
      icon: ShieldAlert,
      items: basis?.riskNotes || [],
      classes: 'border-rose-100 bg-rose-50 text-rose-800',
      iconClasses: 'bg-rose-100 text-rose-700',
    },
  ]
})

function isBasisSectionExpanded(title: string): boolean {
  return expandedBasisSections.value.has(title)
}

function toggleBasisSection(title: string) {
  const next = new Set(expandedBasisSections.value)
  if (next.has(title)) {
    next.delete(title)
  } else {
    next.add(title)
  }
  expandedBasisSections.value = next
}

function visibleBasisItems(section: { title: string; items: string[] }): string[] {
  return isBasisSectionExpanded(section.title) ? section.items : section.items.slice(0, 2)
}

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

onMounted(async () => {
  await Promise.all([
    resumeStore.loadResumes(),
    aiStore.loadConfig(),
  ])
  const resumeId = route.query.resumeId as string
  if (resumeId) {
    selectedResumeId.value = resumeId
  }
})

watch(selectedResumeId, () => {
  optimizationBasis.value = null
  analysisError.value = ''
  basisStale.value = false
  expandedBasisSections.value = new Set()
  generatedContent.value = ''
  generatedSelfIntroduction.value = ''
  introductionError.value = ''
  introductionStale.value = false
  introductionUsedBasis.value = false
  savedSuccess.value = false
  savedResumeId.value = ''
})

watch([companyName, jobTitle, jobDescription, companyInfo], () => {
  if (optimizationBasis.value) {
    basisStale.value = true
  }
  if (generatedContent.value) {
    generatedContent.value = ''
    savedSuccess.value = false
    savedResumeId.value = ''
  }
  if (generatedSelfIntroduction.value) {
    introductionStale.value = true
  }
})

watch(selfIntroductionDirection, () => {
  if (generatedSelfIntroduction.value) {
    introductionStale.value = true
  }
})

function goToSettings() {
  router.push('/settings')
}

function dismissApiKeyWarning() {
  showApiKeyWarning.value = false
}

function resetCustomizeDraft() {
  if (isBusy.value) return
  aiStore.resetCustomizeDraft()
}

function cleanGeneratedContent(content: string): string {
  return content
    .replace(/^```markdown\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

async function handleAnalyze() {
  if (!canWork.value || !selectedResume.value) return

  analysisError.value = ''
  errorMsg.value = ''
  generatedContent.value = ''
  savedSuccess.value = false
  savedResumeId.value = ''

  const request = {
    resumeId: selectedResume.value.id,
    resumeContent: selectedResume.value.content,
    companyName: companyName.value,
    jobTitle: jobTitle.value,
    jobDescription: jobDescription.value,
    companyInfo: companyInfo.value,
  }
  const rag = await db.rag.matchResumeJob(request)

  const result = await aiStore.analyze({
    ...request,
    rag,
  })

  if (result.success && result.data) {
    optimizationBasis.value = result.data
    basisStale.value = false
    expandedBasisSections.value = new Set()
    if (generatedSelfIntroduction.value) {
      introductionStale.value = true
    }
  } else {
    optimizationBasis.value = null
    expandedBasisSections.value = new Set()
    analysisError.value = result.error || '分析失败'
  }
}

async function handleGenerateIntroduction() {
  if (!canWork.value || !selectedResume.value) return

  introductionError.value = ''
  generatedSelfIntroduction.value = ''
  activeResult.value = 'introduction'
  introductionActiveTab.value = 'preview'

  const usableBasis = optimizationBasis.value && !basisStale.value
    ? optimizationBasis.value
    : undefined

  const result = await aiStore.generateIntroduction({
    resumeId: selectedResume.value.id,
    resumeContent: selectedResume.value.content,
    companyName: companyName.value,
    jobTitle: jobTitle.value,
    jobDescription: jobDescription.value,
    companyInfo: companyInfo.value,
    optimizationBasis: usableBasis,
    direction: selfIntroductionDirection.value,
    rag: usableBasis?.rag,
  })

  if (result.success) {
    generatedSelfIntroduction.value = cleanSelfIntroductionContent(result.content)
    introductionUsedBasis.value = !!usableBasis
    introductionStale.value = false
  } else {
    introductionError.value = result.error || '自我介绍生成失败'
  }
}

async function handleGenerate(useBasis = true) {
  if (!canWork.value || !selectedResume.value) return
  errorMsg.value = ''
  generatedContent.value = ''
  savedSuccess.value = false
  savedResumeId.value = ''
  activeTab.value = 'preview'
  activeResult.value = 'resume'

  const result = await aiStore.generate({
    resumeContent: selectedResume.value.content,
    companyName: companyName.value,
    jobTitle: jobTitle.value,
    jobDescription: jobDescription.value,
    companyInfo: companyInfo.value,
    optimizationBasis: useBasis ? optimizationBasis.value || undefined : undefined,
    rag: optimizationBasis.value?.rag,
  })

  if (result.success) {
    generatedContent.value = result.content
    activeTab.value = 'preview'
  } else {
    errorMsg.value = result.error || '生成失败'
  }
}

async function saveAsNewResume() {
  if (!generatedContent.value) return

  const cleanContent = cleanGeneratedContent(generatedContent.value)
  const title = `${companyName.value}-${jobTitle.value}-定制简历`
  const newResume = await resumeStore.createResume({
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

function updateSelfIntroduction(value: string) {
  generatedSelfIntroduction.value = value
  introductionStale.value = false
}

function resetSelfIntroductionDirection() {
  selfIntroductionDirection.value = ''
}

async function copySelfIntroduction() {
  if (!generatedSelfIntroduction.value) return
  try {
    await navigator.clipboard.writeText(generatedSelfIntroduction.value)
    showSuccess('自我介绍已复制')
  } catch {
    showError('复制失败，请在编辑文本中手动复制')
  }
}

async function exportSelfIntroduction() {
  if (!generatedSelfIntroduction.value) return
  try {
    const savedPath = await downloadText(
      generatedSelfIntroduction.value,
      `${companyName.value}-${jobTitle.value}-自我介绍.txt`,
    )
    if (savedPath === null) return
    showSuccess(savedPath ? `自我介绍已导出：${savedPath}` : '自我介绍已开始下载')
  } catch (error) {
    showError(error instanceof Error ? error.message : '自我介绍导出失败')
  }
}

async function exportMd() {
  if (!generatedContent.value) return
  try {
    const savedPath = await downloadMarkdown(generatedContent.value, `${companyName.value}-${jobTitle.value}-定制简历.md`)
    if (savedPath === null) return
    showSuccess(savedPath ? `Markdown 已导出：${savedPath}` : 'Markdown 已开始下载')
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Markdown 导出失败')
  }
}

async function exportTxt() {
  if (!generatedContent.value) return
  try {
    const savedPath = await downloadText(generatedContent.value, `${companyName.value}-${jobTitle.value}-定制简历.txt`)
    if (savedPath === null) return
    showSuccess(savedPath ? `TXT 已导出：${savedPath}` : 'TXT 已开始下载')
  } catch (error) {
    showError(error instanceof Error ? error.message : 'TXT 导出失败')
  }
}
</script>

<template>
  <div class="h-full min-h-0 flex flex-col bg-gray-50">
    <header class="px-5 py-5 bg-white border-b border-gray-100 lg:px-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-primary">简历定制</h1>
          <p class="text-sm text-gray-500 mt-1">选择简历、填写岗位信息，可独立分析依据、生成自我介绍或定向简历</p>
        </div>
        <button
          type="button"
          :disabled="isBusy"
          class="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="清空当前定制草稿"
          @click="resetCustomizeDraft"
        >
          <RotateCcw class="h-4 w-4" />
          一键重置
        </button>
      </div>
    </header>

    <main class="flex-1 min-h-0 overflow-auto p-4 lg:overflow-hidden lg:px-8 lg:py-6">
      <div class="mx-auto flex min-h-full w-full max-w-[1440px] flex-col gap-4 lg:h-full lg:min-h-0 lg:flex-row">
        <aside class="space-y-4 lg:flex lg:h-full lg:w-[42%] lg:max-w-[560px] lg:min-w-[420px] lg:flex-col lg:overflow-hidden lg:pr-1">
          <div class="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-1">
          <div
            v-if="!hasApiKey && showApiKeyWarning"
            class="rounded-lg border border-amber-200 bg-amber-50 p-4"
          >
            <div class="flex items-start gap-3">
              <AlertCircle class="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-amber-800">请先配置 AI API Key</p>
                <p class="mt-1 text-xs leading-5 text-amber-700">未配置时无法使用 AI 分析、生成自我介绍或定向简历，可先完成左侧信息填写。</p>
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

            <el-select v-model="selectedResumeId" placeholder="请选择简历" class="w-full">
              <el-option
                v-for="r in resumeStore.resumes"
                :key="r.id"
                :value="r.id"
                :label="`${r.title}（${getSourceTypeLabel(r)}）`"
              />
            </el-select>

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
                <el-input
                  v-model="companyName"
                  placeholder="例如：字节跳动"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700">职位名称 *</label>
                <el-input
                  v-model="jobTitle"
                  placeholder="例如：前端工程师"
                />
              </div>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium text-gray-700">岗位描述 *</label>
              <el-input
                v-model="jobDescription"
                type="textarea"
                :rows="7"
                placeholder="粘贴岗位 JD 内容..."
              />
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium text-gray-700">公司信息（可选）</label>
              <el-input
                v-model="companyInfo"
                type="textarea"
                :rows="4"
                placeholder="公司规模、地点、业务、团队特点等..."
              />
            </div>
          </section>

          <section class="space-y-3 rounded-lg border border-gray-100 bg-white p-5">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 text-sm font-medium text-gray-800">
                <Mic2 class="h-4 w-4 text-primary" />
                自我介绍优化方向（可选）
              </div>
              <span class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                {{ introductionDirectionStatus }}
              </span>
            </div>
            <el-input
              v-model="selfIntroductionDirection"
              type="textarea"
              :rows="3"
              maxlength="500"
              show-word-limit
              placeholder="可补充你希望重点突出或弱化的内容..."
            />
            <div class="flex items-start justify-between gap-3 text-xs leading-5 text-gray-500">
              <p>
                不填写将使用默认方向：简单带过其他内容，重点讲与岗位高度匹配且有深度的工作或项目经历。
              </p>
              <button
                v-if="selfIntroductionDirection"
                type="button"
                class="shrink-0 font-medium text-primary hover:text-primary-700"
                @click="resetSelfIntroductionDirection"
              >
                恢复默认
              </button>
            </div>
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
          </div>

          <section class="space-y-4 rounded-lg border border-gray-100 bg-white p-5 lg:flex lg:min-h-[260px] lg:max-h-[48%] lg:shrink-0 lg:flex-col">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 text-sm font-medium text-gray-800">
                <Wand2 class="h-4 w-4 text-primary" />
                简历优化依据
              </div>
              <div v-if="optimizationBasis" class="shrink-0 text-xs font-medium text-emerald-700">
                匹配度 {{ optimizationBasis.fitScore }}%
              </div>
            </div>

            <div class="min-h-0 space-y-4 lg:flex-1 lg:overflow-auto lg:pr-1">
            <div v-if="optimizationBasis" class="space-y-4">
              <div>
                <div class="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    class="h-full rounded-full bg-accent transition-all"
                    :style="{ width: fitScoreWidth }"
                  ></div>
                </div>
                <p class="mt-3 text-sm leading-6 text-gray-700">{{ optimizationBasis.fitSummary }}</p>
                <div v-if="optimizationBasis.rag" class="mt-3 rounded-lg border border-gray-100 bg-white/70 p-3">
                  <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-gray-700">RAG 匹配证据</span>
                    <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      {{ optimizationBasis.rag.retrievalMode === 'embedding' ? '语义向量' : '关键词匹配' }}
                    </span>
                  </div>
                  <p v-if="optimizationBasis.rag.warning" class="mb-2 text-xs leading-5 text-amber-700">
                    {{ optimizationBasis.rag.warning }}
                  </p>
                  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div
                      v-for="score in optimizationBasis.rag.dimensionScores"
                      :key="score.dimension"
                      class="rounded-md bg-gray-50 px-2.5 py-2"
                    >
                      <div class="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span class="font-medium text-gray-600">{{ score.dimension }}</span>
                        <span class="text-gray-500">
                          {{ score.score > 0 ? `${score.score}%` : '暂无相关内容' }}
                        </span>
                      </div>
                      <div class="h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <div class="h-full rounded-full bg-accent" :style="{ width: `${score.score}%` }"></div>
                      </div>
                    </div>
                  </div>
                  <div v-if="optimizationBasis.rag.topChunks.length" class="mt-3 space-y-2">
                    <p class="text-xs font-semibold text-gray-700">最相关片段</p>
                    <div
                      v-for="chunk in optimizationBasis.rag.topChunks.slice(0, 3)"
                      :key="chunk.chunkId"
                      class="rounded-md border border-gray-100 bg-gray-50 p-2"
                    >
                      <div class="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span class="font-medium text-gray-600">{{ chunk.sectionTitle }}</span>
                        <span class="text-gray-500">{{ chunk.score }}%</span>
                      </div>
                      <p class="line-clamp-2 text-xs leading-5 text-gray-500">{{ chunk.text }}</p>
                    </div>
                  </div>
                </div>
                <p v-if="basisStale" class="mt-2 text-xs leading-5 text-amber-600">
                  左侧信息已调整，当前依据可能已过期，可重新分析后再生成。
                </p>
              </div>

              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div
                  v-for="section in basisSections"
                  :key="section.title"
                  :class="['min-h-[116px] rounded-lg border p-3', section.classes]"
                >
                  <div class="mb-2 flex items-center gap-2">
                    <span :class="['inline-flex h-7 w-7 items-center justify-center rounded-md', section.iconClasses]">
                      <component :is="section.icon" class="h-4 w-4" />
                    </span>
                    <span class="text-sm font-semibold">{{ section.title }}</span>
                  </div>
                  <ul v-if="section.items.length" class="space-y-1.5 text-xs leading-5">
                    <li
                      v-for="item in section.items.slice(0, 2)"
                      :key="item"
                      class="break-words"
                    >
                      {{ item }}
                    </li>
                      <li v-if="section.items.length > 2" class="opacity-70 flex items-center justify-start">
                      <span class="inline-flex items-center justify-start rounded-lg" >
                        另有 {{ section.items.length - 2 }} 条建议
                      </span>
                     <el-button link style="color: inherit;" @click="toggleBasisSection(section.title)">
                        <template #icon>
                          <el-icon>
                            <component :is="isBasisSectionExpanded(section.title) ? ArrowUp : ArrowDown"  />
                          </el-icon>
                        </template>
                     </el-button>
                    </li>
                    <li
                      v-for="item in visibleBasisItems(section).slice(2)"
                      :key="item"
                      class="break-words"
                      v-show="isBasisSectionExpanded(section.title)"
                    >
                      {{ item }}
                    </li>
                  </ul>
                  <p v-else class="text-xs leading-5 opacity-70">暂无明显内容</p>
                </div>
              </div>
            </div>

            <div
              v-else-if="aiStore.analyzing"
              class="rounded-lg border border-teal-100 bg-teal-50 px-4 py-5 text-center"
            >
              <Loader2 class="mx-auto mb-3 h-8 w-8 animate-spin text-accent" />
              <p class="text-sm font-medium text-teal-900">正在识别优势、差距和修改策略...</p>
              <p class="mt-1 text-xs leading-5 text-teal-700">分析完成后会在这里展示结构化优化依据。</p>
            </div>

            <div
              v-else-if="analysisError"
              class="rounded-lg border border-amber-200 bg-amber-50 p-4"
            >
              <div class="mb-2 flex items-center gap-2 text-amber-800">
                <AlertTriangle class="h-4 w-4" />
                <span class="text-sm font-medium">优化依据分析失败</span>
              </div>
              <p class="text-xs leading-5 text-amber-700">{{ analysisError }}</p>
              <p class="mt-2 text-xs leading-5 text-amber-700">可以重新分析，也可以跳过分析直接生成简历。</p>
            </div>

            <div v-else class="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
              <p class="text-sm font-medium text-gray-700">先让 AI 给出一份可解释的优化依据</p>
              <p class="mt-1 text-xs leading-5 text-gray-500">
                会识别已匹配优势、较弱能力、可迁移经历、关键词策略、修改策略和风险提示。
              </p>
            </div>
            </div>

            <div class="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:shrink-0">
              <button
                type="button"
                :disabled="isBusy || !canWork"
                class="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-1.5 py-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                @click="handleAnalyze"
              >
                <Loader2 v-if="aiStore.analyzing" class="h-3.5 w-3.5 animate-spin" />
                <RefreshCw v-else-if="optimizationBasis || analysisError" class="h-3.5 w-3.5" />
                <Sparkles v-else class="h-3.5 w-3.5" />
                {{ aiStore.analyzing ? '分析中...' : (optimizationBasis || analysisError ? '重新分析' : '分析优化依据') }}
              </button>

              <button
                type="button"
                :disabled="isBusy || !canWork"
                class="inline-flex items-center justify-center gap-1 rounded-lg border border-accent px-1.5 py-2.5 text-xs font-medium text-accent-dark transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                @click="handleGenerateIntroduction"
              >
                <Loader2 v-if="aiStore.generatingIntroduction" class="h-3.5 w-3.5 animate-spin" />
                <Mic2 v-else class="h-3.5 w-3.5" />
                {{ aiStore.generatingIntroduction ? '生成中...' : '生成自我介绍' }}
              </button>

              <button
                type="button"
                :disabled="isBusy || !canWork"
                class="inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-1.5 py-2.5 text-xs font-medium text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
                @click="handleGenerate(!!optimizationBasis)"
              >
                <Loader2 v-if="aiStore.generating" class="h-3.5 w-3.5 animate-spin" />
                <Sparkles v-else class="h-3.5 w-3.5" />
                {{ aiStore.generating ? '生成中...' : '生成定制简历' }}
              </button>
            </div>
          </section>
        </aside>

        <section class="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-lg border border-gray-100 bg-white lg:h-full lg:min-h-0">
          <div class="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
            <div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                :class="[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  activeResult === 'resume' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-800',
                ]"
                @click="activeResult = 'resume'"
              >
                <FileText class="h-4 w-4" />
                优化简历
              </button>
              <button
                type="button"
                :class="[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  activeResult === 'introduction' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-800',
                ]"
                @click="activeResult = 'introduction'"
              >
                <Mic2 class="h-4 w-4" />
                自我介绍
              </button>
            </div>

            <div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
              <template v-if="activeResult === 'resume'">
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
              </template>
              <template v-else>
                <button
                  type="button"
                  :class="[
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    introductionActiveTab === 'preview' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800',
                  ]"
                  @click="introductionActiveTab = 'preview'"
                >
                  <Eye class="h-4 w-4" />
                  阅读稿
                </button>
                <button
                  type="button"
                  :class="[
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    introductionActiveTab === 'source' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800',
                  ]"
                  @click="introductionActiveTab = 'source'"
                >
                  <FileText class="h-4 w-4" />
                  编辑文本
                </button>
              </template>
            </div>

            <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
              <template v-if="activeResult === 'introduction' && generatedSelfIntroduction">
                <span
                  :class="[
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    introductionStale ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                  ]"
                >
                  {{ introductionStale ? '输入已变化' : (introductionUsedBasis ? '已参考优化依据' : '未使用优化依据') }}
                </span>
                <span class="text-xs text-gray-400">
                  {{ introductionDuration }} · {{ generatedSelfIntroduction.length }} 字
                </span>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  @click="copySelfIntroduction"
                >
                  <Clipboard class="h-3.5 w-3.5" />
                  复制
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  @click="exportSelfIntroduction"
                >
                  <FileDown class="h-3.5 w-3.5" />
                  导出 TXT
                </button>
              </template>
              <span v-else class="text-xs text-gray-400">{{ activeResultLength }} 字符</span>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <template v-if="activeResult === 'resume'">
              <div v-if="aiStore.generating" class="flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
                <Loader2 class="mb-4 h-12 w-12 animate-spin text-accent" />
                <p class="text-sm font-medium text-gray-700">{{ generationLoadingText }}</p>
                <p class="mt-1 text-xs text-gray-400">这可能需要几秒钟，请耐心等待</p>
              </div>

              <div v-else-if="errorMsg" class="p-6">
                <div class="rounded-lg border border-red-200 bg-red-50 p-5">
                  <div class="mb-2 flex items-center gap-2 text-red-700">
                    <AlertCircle class="h-5 w-5" />
                    <span class="font-medium">简历生成失败</span>
                  </div>
                  <p class="whitespace-pre-wrap break-words text-sm leading-6 text-red-600">{{ errorMsg }}</p>
                  <button
                    type="button"
                    :disabled="!canWork"
                    class="mt-4 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    @click="handleGenerate(!!optimizationBasis)"
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
                <p class="text-base font-medium text-gray-800">填写左侧信息后生成定制简历</p>
                <p class="mt-2 max-w-sm text-sm leading-6 text-gray-500">可以先分析优化依据，也可以直接生成。生成完成后，可在这里预览定制简历或微调 Markdown 源码。</p>
              </div>
            </template>

            <template v-else>
              <div v-if="aiStore.generatingIntroduction" class="flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
                <Loader2 class="mb-4 h-12 w-12 animate-spin text-accent" />
                <p class="text-sm font-medium text-gray-700">AI 正在生成两分钟内的岗位定向自我介绍...</p>
                <p class="mt-1 text-xs text-gray-400">这是一次独立生成，不会改动已生成的简历</p>
              </div>

              <div v-else-if="introductionError" class="p-6">
                <div class="rounded-lg border border-red-200 bg-red-50 p-5">
                  <div class="mb-2 flex items-center gap-2 text-red-700">
                    <AlertCircle class="h-5 w-5" />
                    <span class="font-medium">自我介绍生成失败</span>
                  </div>
                  <p class="whitespace-pre-wrap break-words text-sm leading-6 text-red-600">{{ introductionError }}</p>
                  <button
                    type="button"
                    :disabled="!canWork"
                    class="mt-4 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    @click="handleGenerateIntroduction"
                  >
                    重试
                  </button>
                </div>
              </div>

              <div v-else-if="generatedSelfIntroduction" class="min-h-full">
                <div
                  v-if="introductionActiveTab === 'preview'"
                  class="mx-auto min-h-full max-w-3xl whitespace-pre-wrap px-6 py-8 text-[15px] leading-8 text-gray-800 sm:px-10 lg:py-10"
                >{{ generatedSelfIntroduction }}</div>
                <textarea
                  v-else
                  :value="generatedSelfIntroduction"
                  class="h-full min-h-[520px] w-full resize-none border-0 p-6 text-[15px] leading-8 text-gray-800 focus:outline-none focus:ring-0 sm:p-8"
                  spellcheck="false"
                  @input="updateSelfIntroduction(($event.target as HTMLTextAreaElement).value)"
                ></textarea>
              </div>

              <div v-else class="flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
                <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
                  <Mic2 class="h-8 w-8 text-primary" />
                </div>
                <p class="text-base font-medium text-gray-800">独立生成岗位定向自我介绍</p>
                <p class="mt-2 max-w-md text-sm leading-6 text-gray-500">
                  优化依据不是必需项；有依据时作为可选参考，没有时直接根据已有简历和岗位信息生成。
                </p>
              </div>
            </template>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
