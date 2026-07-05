<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useResumeStore } from '@/stores/resume'
import { useApplicationStore } from '@/stores/application'
import { DEFAULT_AI_CONFIG } from '@/utils/db'
import { db } from '@/utils/db-adapter'
import { downloadFile } from '@/utils/markdown'
import { showError, showSuccess } from '@/utils/message'
import {
  Key, Eye, EyeOff, Save, Zap, Loader2, Database, Download,
  Trash2, CheckCircle, XCircle, Info,
} from 'lucide-vue-next'
import type { AIConfig } from '@/types'

const aiStore = useAIStore()
const resumeStore = useResumeStore()
const applicationStore = useApplicationStore()

// 表单状态
const provider = ref<AIConfig['provider']>('deepseek')
const apiKey = ref('')
const baseUrl = ref('')
const model = ref('')
const ragMode = ref<AIConfig['ragMode']>('auto')
const embeddingProvider = ref<AIConfig['embeddingProvider']>('aliyun-bailian')
const embeddingApiKey = ref('')
const embeddingModel = ref('')
const embeddingEndpoint = ref('')
const embeddingDimension = ref<number | undefined>()
const showApiKey = ref(false)
const showEmbeddingApiKey = ref(false)

// UI 状态
const saving = ref(false)
const testing = ref(false)
const testResult = ref<'success' | 'fail' | null>(null)
const testMessage = ref('')
const saveSuccess = ref(false)
const confirmingClear = ref(false)

onMounted(async () => {
  const config = await aiStore.loadConfig()
  provider.value = config.provider
  apiKey.value = config.apiKey
  baseUrl.value = config.baseUrl
  model.value = config.model
  ragMode.value = config.ragMode
  embeddingProvider.value = config.embeddingProvider
  embeddingApiKey.value = config.embeddingApiKey
  embeddingModel.value = config.embeddingModel
  embeddingEndpoint.value = config.embeddingEndpoint
  embeddingDimension.value = config.embeddingDimension
  await Promise.all([
    resumeStore.loadResumes(),
    applicationStore.loadApplications(),
  ])
})

function onProviderChange() {
  if (provider.value === 'deepseek') {
    baseUrl.value = 'https://api.deepseek.com/v1'
    model.value = 'deepseek-chat'
  } else if (provider.value === 'aliyun-bailian') {
    baseUrl.value = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    model.value = 'qwen-plus'
  }
}

async function saveConfig() {
  saving.value = true
  await aiStore.saveConfig({
    provider: provider.value,
    apiKey: apiKey.value,
    baseUrl: baseUrl.value,
    model: model.value,
    ragMode: ragMode.value,
    embeddingProvider: embeddingProvider.value,
    embeddingApiKey: embeddingApiKey.value,
    embeddingModel: embeddingModel.value,
    embeddingEndpoint: embeddingEndpoint.value,
    embeddingDimension: embeddingDimension.value,
  })
  saving.value = false
  saveSuccess.value = true
  setTimeout(() => { saveSuccess.value = false }, 3000)
}

async function testConnection() {
  testing.value = true
  testResult.value = null
  // 先保存配置，确保测试使用最新配置
  await aiStore.saveConfig({
    provider: provider.value,
    apiKey: apiKey.value,
    baseUrl: baseUrl.value,
    model: model.value,
    ragMode: ragMode.value,
    embeddingProvider: embeddingProvider.value,
    embeddingApiKey: embeddingApiKey.value,
    embeddingModel: embeddingModel.value,
    embeddingEndpoint: embeddingEndpoint.value,
    embeddingDimension: embeddingDimension.value,
  })
  const ok = await aiStore.testConnection()
  testResult.value = ok ? 'success' : 'fail'
  testMessage.value = ok ? '连接成功' : '连接失败，请检查配置'
  testing.value = false
}

async function exportData() {
  try {
    const data: Record<string, unknown> = {
      resumes: await db.resumes.getAll(),
      applications: await db.applications.getAll(),
      aiConfig: await db.aiConfig.get(),
    }
    data._exportedAt = new Date().toISOString()
    const savedPath = await downloadFile(
      JSON.stringify(data, null, 2),
      `job-assistant-backup-${Date.now()}.json`,
      'application/json;charset=utf-8'
    )
    if (savedPath === null) return
    showSuccess(savedPath ? `数据已导出：${savedPath}` : '数据已开始下载')
  } catch (error) {
    showError(error instanceof Error ? error.message : '数据导出失败')
  }
}

async function clearAllData() {
  if (!confirmingClear.value) {
    confirmingClear.value = true
    setTimeout(() => { confirmingClear.value = false }, 5000)
    return
  }
  const applications = await db.applications.getAll()
  for (const item of applications) {
    await db.applications.delete(item.id)
  }
  const resumes = await db.resumes.getAll()
  for (const item of resumes) {
    await db.resumes.delete(item.id)
  }
  const defaultConfig = await aiStore.saveConfig(DEFAULT_AI_CONFIG)
  provider.value = defaultConfig.provider
  apiKey.value = defaultConfig.apiKey
  baseUrl.value = defaultConfig.baseUrl
  model.value = defaultConfig.model
  ragMode.value = defaultConfig.ragMode
  embeddingProvider.value = defaultConfig.embeddingProvider
  embeddingApiKey.value = defaultConfig.embeddingApiKey
  embeddingModel.value = defaultConfig.embeddingModel
  embeddingEndpoint.value = defaultConfig.embeddingEndpoint
  embeddingDimension.value = defaultConfig.embeddingDimension
  await Promise.all([
    resumeStore.loadResumes(),
    applicationStore.loadApplications(),
  ])
  confirmingClear.value = false
}
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- 顶部标题栏 -->
    <header class="px-8 py-6 bg-white border-b border-gray-100">
      <h1 class="text-2xl font-semibold text-primary">设置</h1>
    </header>

    <main class="flex-1 overflow-auto px-8 py-6">
      <div class="max-w-3xl mx-auto space-y-6">
        <!-- AI 配置卡片 -->
        <section class="bg-white rounded-xl border border-gray-100 p-6">
          <div class="flex items-center gap-2 text-base font-semibold text-gray-800 mb-1">
            <Key class="w-5 h-5 text-primary" />
            AI 配置
          </div>
          <p class="text-xs text-gray-500 mb-5">配置 AI 服务以启用简历定制功能</p>

          <div class="space-y-4">
            <!-- Provider -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">API Provider</label>
              <select
                v-model="provider"
                @change="onProviderChange"
                class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="deepseek">DeepSeek</option>
                <option value="aliyun-bailian">阿里云百炼</option>
                <option value="custom">自定义</option>
              </select>
            </div>

            <!-- API Key -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">API Key</label>
              <div class="relative">
                <input
                  v-model="apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  placeholder="输入 API Key..."
                  class="w-full px-3 py-2 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  @click="showApiKey = !showApiKey"
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Eye v-if="!showApiKey" class="w-4 h-4" />
                  <EyeOff v-else class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Base URL -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Base URL</label>
              <input
                v-model="baseUrl"
                type="text"
                placeholder="https://api.deepseek.com/v1"
                class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <!-- Model -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Model</label>
              <input
                v-model="model"
                type="text"
                placeholder="deepseek-chat"
                class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div class="border-t border-gray-100 pt-4">
              <div class="mb-3">
                <h3 class="text-sm font-semibold text-gray-800">RAG 语义匹配配置</h3>
                <p class="mt-1 text-xs leading-5 text-gray-500">默认使用阿里云百炼 text-embedding-v4；未配置或调用失败时自动降级为本地关键词匹配。</p>
              </div>

              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1.5">匹配模式</label>
                  <select
                    v-model="ragMode"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="auto">自动（优先语义向量，失败降级关键词）</option>
                    <option value="embedding">仅语义向量</option>
                    <option value="keyword">仅关键词匹配</option>
                  </select>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1.5">Embedding Provider</label>
                  <select
                    v-model="embeddingProvider"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="aliyun-bailian">阿里云百炼</option>
                    <option value="openai-compatible">OpenAI 兼容</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1.5">Embedding API Key</label>
                  <div class="relative">
                    <input
                      v-model="embeddingApiKey"
                      :type="showEmbeddingApiKey ? 'text' : 'password'"
                      placeholder="输入百炼 DashScope API Key..."
                      class="w-full px-3 py-2 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      @click="showEmbeddingApiKey = !showEmbeddingApiKey"
                      class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Eye v-if="!showEmbeddingApiKey" class="w-4 h-4" />
                      <EyeOff v-else class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1.5">Embedding Model</label>
                    <input
                      v-model="embeddingModel"
                      type="text"
                      placeholder="text-embedding-v4"
                      class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1.5">Dimension（可选）</label>
                    <input
                      v-model.number="embeddingDimension"
                      type="number"
                      min="1"
                      placeholder="留空使用模型默认"
                      class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1.5">Embedding Endpoint</label>
                  <input
                    v-model="embeddingEndpoint"
                    type="text"
                    placeholder="https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex flex-wrap items-center gap-2 pt-2">
              <button
                @click="saveConfig"
                :disabled="saving"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                <Save class="w-4 h-4" />
                保存配置
              </button>
              <button
                @click="testConnection"
                :disabled="testing || !apiKey"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Loader2 v-if="testing" class="w-4 h-4 animate-spin" />
                <Zap v-else class="w-4 h-4" />
                {{ testing ? '测试中...' : '测试连接' }}
              </button>
              <span v-if="saveSuccess" class="inline-flex items-center gap-1 text-xs text-green-600">
                <CheckCircle class="w-3.5 h-3.5" />
                已保存
              </span>
              <span v-else-if="testResult === 'success'" class="inline-flex items-center gap-1 text-xs text-green-600">
                <CheckCircle class="w-3.5 h-3.5" />
                {{ testMessage }}
              </span>
              <span v-else-if="testResult === 'fail'" class="inline-flex items-center gap-1 text-xs text-red-600">
                <XCircle class="w-3.5 h-3.5" />
                {{ testMessage }}
              </span>
            </div>
          </div>
        </section>

        <!-- 数据管理卡片 -->
        <section class="bg-white rounded-xl border border-gray-100 p-6">
          <div class="flex items-center gap-2 text-base font-semibold text-gray-800 mb-1">
            <Database class="w-5 h-5 text-primary" />
            数据管理
          </div>
          <p class="text-xs text-gray-500 mb-5">浏览器模式存储在 localStorage；桌面端将存储在本机 SQLite 数据库。</p>

          <!-- 数据统计 -->
          <div class="grid grid-cols-2 gap-3 mb-5">
            <div class="bg-gray-50 rounded-lg p-4">
              <div class="text-xs text-gray-500 font-medium mb-1">简历数量</div>
              <div class="text-2xl font-semibold text-gray-800">{{ resumeStore.resumes.length }}</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <div class="text-xs text-gray-500 font-medium mb-1">投递记录</div>
              <div class="text-2xl font-semibold text-gray-800">{{ applicationStore.applications.length }}</div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex flex-wrap items-center gap-2">
            <button
              @click="exportData"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Download class="w-4 h-4" />
              导出数据
            </button>
            <button
              @click="clearAllData"
              :class="[
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                confirmingClear
                  ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                  : 'border-red-200 text-red-600 hover:bg-red-50',
              ]"
            >
              <Trash2 class="w-4 h-4" />
              {{ confirmingClear ? '再次点击确认清空' : '清空数据' }}
            </button>
          </div>
        </section>

        <!-- 关于卡片 -->
        <section class="bg-white rounded-xl border border-gray-100 p-6">
          <div class="flex items-center gap-2 text-base font-semibold text-gray-800 mb-3">
            <Info class="w-5 h-5 text-primary" />
            关于
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">应用名称</span>
              <span class="text-gray-800">AI 求职助手</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">版本号</span>
              <span class="text-gray-800">v1.0.0</span>
            </div>
            <div class="pt-2 border-t border-gray-100 mt-3">
              <p class="text-xs text-gray-500 leading-relaxed">
                桌面端数据会保存在本机数据库中；浏览器模式仍使用 localStorage。AI 与 Embedding 仅在你配置 API Key 后调用对应服务，请定期使用"导出数据"功能备份。
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
