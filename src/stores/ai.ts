// AI Store —— AI 配置 + 简历定制页状态
//
// 此 Store 管理两类状态：
//   1. 全局 AI 配置（config, loadConfig, saveConfig, testConnection）
//   2. 简历定制页专属状态（customize* 系列）
//
// 定制页状态为什么要放在 Store 而非组件内？
//   Customize.vue 的左侧有多个 Tab（基本信息、优化依据等），
//   切换 Tab 会导致组件销毁重建，如果状态在组件内会丢失。
//   将表单数据提升到 Store 后，组件销毁不影响数据保留。

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
import { DEFAULT_AI_CONFIG } from '@/utils/db'
import { db } from '@/utils/db-adapter'
import { analyzeResumeOptimizationBasis, generateResume, testAIConnection } from '@/utils/ai'

type CustomizeActiveTab = 'preview' | 'source'

export const useAIStore = defineStore('ai', () => {
  // ===== 全局 AI 配置 =====
  const config = ref<AIConfig>(DEFAULT_AI_CONFIG)
  const analyzing = ref(false)
  const generating = ref(false)
  const optimizationBasis = ref<OptimizationBasis | null>(null)
  const lastAnalysis = ref<AnalyzeResponse | null>(null)
  const lastResult = ref<GenerateResponse | null>(null)

  // ===== 简历定制页状态 =====
  // 定制页有大量表单字段，切换 Tab 会导致组件销毁，
  // 因此表单数据提升到 Store 持久化。
  const customizeSelectedResumeId = ref('')
  const customizeCompanyName = ref('')
  const customizeJobTitle = ref('')
  const customizeJobDescription = ref('')
  const customizeCompanyInfo = ref('')
  const customizeOptimizationBasis = ref<OptimizationBasis | null>(null)
  const customizeAnalysisError = ref('')

  /**
   * 优化依据过期标记
   *
   * 当用户在分析完成后修改了岗位信息（公司名/职位/JD），
   * basisStale 自动置为 true，提示用户需要重新分析。
   * 防止基于过期的分析依据生成不准确的简历。
   */
  const customizeBasisStale = ref(false)

  const customizeGeneratedContent = ref('')
  const customizeErrorMsg = ref('')
  const customizeSavedSuccess = ref(false)
  const customizeSavedResumeId = ref('')
  const customizeActiveTab = ref<CustomizeActiveTab>('preview')
  const customizeShowApiKeyWarning = ref(true)

  /** 优化依据各部分的展开/折叠状态（Set 保证切换 Tab 后不丢失） */
  const customizeExpandedBasisSections = ref<Set<string>>(new Set())

  async function loadConfig() {
    config.value = await db.aiConfig.get()
    return config.value
  }

  async function saveConfig(data: Partial<AIConfig>) {
    config.value = await db.aiConfig.save(data)
    return config.value
  }

  /**
   * 分析简历优化依据 —— Step 1
   *
   * 调用 analyzeResumeOptimizationBasis，内部会：
   *   1. 通过 db.rag.matchResumeJob() 做 RAG 检索
   *   2. 将 RAG 结果注入 Prompt
   *   3. 调用 LLM 获取结构化优化依据
   */
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

  /**
   * 生成定向简历 —— Step 2
   *
   * 必须先在 Step 1 完成分析后才能调用。
   * Prompt 中会注入优化依据和 RAG 匹配证据。
   */
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

  async function testConnection(): Promise<boolean> {
    return testAIConnection(config.value)
  }

  /** 重置定制页所有草稿状态 */
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
    loadConfig,
    saveConfig,
    analyze,
    generate,
    testConnection,
    resetCustomizeDraft,
  }
})
