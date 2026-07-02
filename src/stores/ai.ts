import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  AIConfig,
  AnalyzeRequest,
  AnalyzeResponse,
  GenerateRequest,
  GenerateResponse,
  OptimizationBasis,
} from '@/types'
import { aiConfigDb } from '@/utils/db'
import { analyzeResumeOptimizationBasis, generateResume, testAIConnection } from '@/utils/ai'

type CustomizeActiveTab = 'preview' | 'source'

export const useAIStore = defineStore('ai', () => {
  const config = ref<AIConfig>(aiConfigDb.get())
  const analyzing = ref(false)
  const generating = ref(false)
  const optimizationBasis = ref<OptimizationBasis | null>(null)
  const lastAnalysis = ref<AnalyzeResponse | null>(null)
  const lastResult = ref<GenerateResponse | null>(null)
  const customizeSelectedResumeId = ref('')
  const customizeCompanyName = ref('')
  const customizeJobTitle = ref('')
  const customizeJobDescription = ref('')
  const customizeCompanyInfo = ref('')
  const customizeOptimizationBasis = ref<OptimizationBasis | null>(null)
  const customizeAnalysisError = ref('')
  const customizeBasisStale = ref(false)
  const customizeGeneratedContent = ref('')
  const customizeErrorMsg = ref('')
  const customizeSavedSuccess = ref(false)
  const customizeSavedResumeId = ref('')
  const customizeActiveTab = ref<CustomizeActiveTab>('preview')
  const customizeShowApiKeyWarning = ref(true)
  const customizeExpandedBasisSections = ref<Set<string>>(new Set())

  // 保存配置
  function saveConfig(data: Partial<AIConfig>) {
    config.value = aiConfigDb.save(data)
  }

  // 分析简历优化依据
  async function analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    analyzing.value = true
    try {
      const result = await analyzeResumeOptimizationBasis(request)
      lastAnalysis.value = result
      optimizationBasis.value = result.data || null
      return result
    } finally {
      analyzing.value = false
    }
  }

  // 生成定向简历
  async function generate(request: GenerateRequest): Promise<GenerateResponse> {
    generating.value = true
    try {
      const result = await generateResume(request)
      lastResult.value = result
      return result
    } finally {
      generating.value = false
    }
  }

  // 测试连接
  async function testConnection(): Promise<boolean> {
    return testAIConnection(config.value)
  }

  // 重置简历定制页草稿
  function resetCustomizeDraft() {
    customizeSelectedResumeId.value = ''
    customizeCompanyName.value = ''
    customizeJobTitle.value = ''
    customizeJobDescription.value = ''
    customizeCompanyInfo.value = ''
    customizeOptimizationBasis.value = null
    customizeAnalysisError.value = ''
    customizeBasisStale.value = false
    customizeGeneratedContent.value = ''
    customizeErrorMsg.value = ''
    customizeSavedSuccess.value = false
    customizeSavedResumeId.value = ''
    customizeActiveTab.value = 'preview'
    customizeShowApiKeyWarning.value = true
    customizeExpandedBasisSections.value = new Set()
  }

  return {
    config,
    analyzing,
    generating,
    optimizationBasis,
    lastAnalysis,
    lastResult,
    customizeSelectedResumeId,
    customizeCompanyName,
    customizeJobTitle,
    customizeJobDescription,
    customizeCompanyInfo,
    customizeOptimizationBasis,
    customizeAnalysisError,
    customizeBasisStale,
    customizeGeneratedContent,
    customizeErrorMsg,
    customizeSavedSuccess,
    customizeSavedResumeId,
    customizeActiveTab,
    customizeShowApiKeyWarning,
    customizeExpandedBasisSections,
    saveConfig,
    analyze,
    generate,
    testConnection,
    resetCustomizeDraft,
  }
})
