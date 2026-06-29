import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AIConfig, GenerateRequest, GenerateResponse } from '@/types'
import { aiConfigDb } from '@/utils/db'
import { generateResume, testAIConnection } from '@/utils/ai'

export const useAIStore = defineStore('ai', () => {
  const config = ref<AIConfig>(aiConfigDb.get())
  const generating = ref(false)
  const lastResult = ref<GenerateResponse | null>(null)

  // 保存配置
  function saveConfig(data: Partial<AIConfig>) {
    config.value = aiConfigDb.save(data)
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
    generating,
    lastResult,
    saveConfig,
    generate,
    testConnection,
  }
})
