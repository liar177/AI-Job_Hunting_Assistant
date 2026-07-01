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

export const useAIStore = defineStore('ai', () => {
  const config = ref<AIConfig>(aiConfigDb.get())
  const analyzing = ref(false)
  const generating = ref(false)
  const optimizationBasis = ref<OptimizationBasis | null>(null)
  const lastAnalysis = ref<AnalyzeResponse | null>(null)
  const lastResult = ref<GenerateResponse | null>(null)

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

  return {
    config,
    analyzing,
    generating,
    optimizationBasis,
    lastAnalysis,
    lastResult,
    saveConfig,
    analyze,
    generate,
    testConnection,
  }
})
