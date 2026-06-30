<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import { useAIStore } from '@/stores/ai'
import GenerateResult from '@/components/Customize/GenerateResult.vue'
import {
  FileText, Briefcase, Sparkles, Loader2,
  AlertCircle, ChevronRight, ChevronLeft,
  Settings as SettingsIcon,
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const resumeStore = useResumeStore()
const aiStore = useAIStore()

const currentStep = ref(1)
const selectedResumeId = ref('')
const companyName = ref('')
const jobTitle = ref('')
const jobDescription = ref('')
const companyInfo = ref('')
const generatedContent = ref('')
const errorMsg = ref('')
const savedSuccess = ref(false)

const selectedResume = computed(() =>
  resumeStore.resumes.find((r) => r.id === selectedResumeId.value)
)
const hasApiKey = computed(() => !!aiStore.config.apiKey)

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

const steps = [
  { num: 1, label: '选择简历' },
  { num: 2, label: '岗位信息' },
  { num: 3, label: '生成简历' },
]

onMounted(() => {
  resumeStore.loadResumes()
  // 检查URL参数，如果有resumeId则直接跳到第二步
  const resumeId = route.query.resumeId as string
  if (resumeId) {
    selectedResumeId.value = resumeId
    currentStep.value = 2
  }
})

function goToSettings() {
  router.push('/settings')
}

function canNext(): boolean {
  if (currentStep.value === 1) return !!selectedResumeId.value
  if (currentStep.value === 2) {
    return !!companyName.value.trim() && !!jobTitle.value.trim() && !!jobDescription.value.trim()
  }
  return false
}

function nextStep() {
  if (canNext() && currentStep.value < 3) currentStep.value++
}

function prevStep() {
  if (currentStep.value > 1) currentStep.value--
}

async function handleGenerate() {
  if (!selectedResume.value) return
  errorMsg.value = ''
  generatedContent.value = ''
  const result = await aiStore.generate({
    resumeContent: selectedResume.value.content,
    jobDescription: jobDescription.value,
    companyInfo: companyInfo.value,
  })
  if (result.success) {
    generatedContent.value = result.content
  } else {
    errorMsg.value = result.error || '生成失败'
  }
}

function saveAsNewResume() {
  if (!generatedContent.value) return
  // 清理markdown代码块标记
  let cleanContent = generatedContent.value
  // 移除开头和结尾的markdown代码块标记
  cleanContent = cleanContent.replace(/^```markdown\s*/i, '')
  cleanContent = cleanContent.replace(/```\s*$/i, '')
  cleanContent = cleanContent.trim()
  
  const title = `${companyName.value}-${jobTitle.value}-定制简历`
  resumeStore.createResume({
    title,
    content: cleanContent,
    originalContent: cleanContent,
  })
  savedSuccess.value = true
}

// 跳转到投递管理
function goToApplication() {
  // 先保存为新简历
  if (generatedContent.value) {
    // 清理markdown代码块标记
    let cleanContent = generatedContent.value
    cleanContent = cleanContent.replace(/^```markdown\s*/i, '')
    cleanContent = cleanContent.replace(/```\s*$/i, '')
    cleanContent = cleanContent.trim()
    
    const title = `${companyName.value}-${jobTitle.value}-定制简历`
    const newResume = resumeStore.createResume({
      title,
      content: cleanContent,
      originalContent: cleanContent,
    })
    // 跳转到投递管理并预填信息
    router.push(`/applications?companyName=${encodeURIComponent(companyName.value)}&jobTitle=${encodeURIComponent(jobTitle.value)}&resumeId=${newResume.id}`)
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- 顶部标题栏 -->
    <header class="px-8 py-6 bg-white border-b border-gray-100">
      <h1 class="text-2xl font-semibold text-primary">简历定制</h1>
      <p class="text-sm text-gray-500 mt-1">根据岗位信息智能生成定向简历</p>
    </header>

    <main class="flex-1 overflow-auto px-8 py-6">
      <div class="max-w-5xl mx-auto">
        <!-- API Key 未配置提示 -->
        <div
          v-if="!hasApiKey"
          class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center justify-between"
        >
          <div class="flex items-center gap-3">
            <AlertCircle class="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p class="text-sm text-amber-700">请先到设置页面配置 AI API Key</p>
          </div>
          <button
            @click="goToSettings"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors"
          >
            <SettingsIcon class="w-3.5 h-3.5" />
            前往设置
          </button>
        </div>

        <!-- 步骤指示器 -->
        <div class="flex items-center justify-center mb-8">
          <template v-for="(step, idx) in steps" :key="step.num">
            <div class="flex items-center gap-2">
              <div
                :class="[
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  currentStep >= step.num ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500',
                ]"
              >
                {{ step.num }}
              </div>
              <span
                :class="[
                  'text-sm font-medium',
                  currentStep >= step.num ? 'text-primary' : 'text-gray-500',
                ]"
              >{{ step.label }}</span>
            </div>
            <div
              v-if="idx < steps.length - 1"
              :class="[
                'w-16 h-px mx-3',
                currentStep > step.num ? 'bg-primary' : 'bg-gray-200',
              ]"
            ></div>
          </template>
        </div>

        <!-- 第一步：选择简历 -->
        <section v-if="currentStep === 1" class="bg-white rounded-xl border border-gray-100 p-6">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-4">
            <FileText class="w-4 h-4 text-primary" />
            选择已有简历
          </div>
          <select
            v-model="selectedResumeId"
            class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>请选择简历</option>
            <option v-for="r in resumeStore.resumes" :key="r.id" :value="r.id">
              {{ r.title }}（{{ getSourceTypeLabel(r) }}）
            </option>
          </select>
          <p v-if="resumeStore.resumes.length === 0" class="text-xs text-amber-600 mt-2">
            还没有简历，请先去简历管理创建
          </p>
          <div v-if="selectedResume" class="mt-4">
            <div class="text-xs text-gray-500 mb-2">简历预览：</div>
            <div class="bg-gray-50 rounded-lg border border-gray-100 p-4 max-h-64 overflow-auto">
              <pre class="text-xs text-gray-700 whitespace-pre-wrap break-words font-mono">{{ selectedResume.content.slice(0, 500) }}{{ selectedResume.content.length > 500 ? '...' : '' }}</pre>
            </div>
          </div>
        </section>

        <!-- 第二步：填写岗位信息 -->
        <section v-else-if="currentStep === 2" class="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Briefcase class="w-4 h-4 text-primary" />
            填写岗位信息
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">公司名称 *</label>
              <input v-model="companyName" type="text" placeholder="例如：字节跳动" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">职位名称 *</label>
              <input v-model="jobTitle" type="text" placeholder="例如：前端工程师" class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">岗位描述 *</label>
            <textarea v-model="jobDescription" rows="5" placeholder="粘贴岗位 JD 内容..." class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">公司信息（可选）</label>
            <textarea v-model="companyInfo" rows="3" placeholder="公司规模、地点、业务等..." class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y"></textarea>
          </div>
        </section>

        <!-- 第三步：生成简历 -->
        <section v-else-if="currentStep === 3" class="space-y-6">
          <!-- 确认信息卡片 -->
          <div class="bg-white rounded-xl border border-gray-100 p-6">
            <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-4">
              <Sparkles class="w-4 h-4 text-primary" />
              确认信息并生成
            </div>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">所选简历</span>
                <span class="text-gray-800 font-medium">{{ selectedResume?.title }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">目标公司</span>
                <span class="text-gray-800 font-medium">{{ companyName }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">目标职位</span>
                <span class="text-gray-800 font-medium">{{ jobTitle }}</span>
              </div>
            </div>
            <button
              @click="handleGenerate"
              :disabled="aiStore.generating || !hasApiKey"
              class="w-full mt-6 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Loader2 v-if="aiStore.generating" class="w-4 h-4 animate-spin" />
              <Sparkles v-else class="w-4 h-4" />
              {{ aiStore.generating ? '生成中...' : (generatedContent ? '重新生成' : '一键生成定向简历') }}
            </button>
          </div>

          <!-- 返回上一步按钮 -->
          <div v-if="!aiStore.generating" class="flex items-center justify-between mt-6">
            <button
              @click="prevStep"
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft class="w-4 h-4" />
              返回修改岗位信息
            </button>
            <div></div>
          </div>
        </section>
        <div v-if="currentStep < 3 && !aiStore.generating" class="flex items-center justify-between mt-6">
          <button
            v-if="currentStep > 1"
            @click="prevStep"
            class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft class="w-4 h-4" />
            上一步
          </button>
          <div v-else></div>
          <button
            @click="nextStep"
            :disabled="!canNext()"
            class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一步
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- 生成结果区域 - 独立于 max-w-5xl 容器之外，占满可用宽度 -->
      <GenerateResult
        v-if="currentStep === 3 && (aiStore.generating || generatedContent)"
        :generating="aiStore.generating"
        :error-msg="errorMsg"
        :content="generatedContent"
        :saved-success="savedSuccess"
        :company-name="companyName"
        :job-title="jobTitle"
        @regenerate="handleGenerate"
        @save="saveAsNewResume"
        @update:content="generatedContent = $event"
        @go-to-application="goToApplication"
      />
    </main>
  </div>
</template>
