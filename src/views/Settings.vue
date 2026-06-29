<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useResumeStore } from '@/stores/resume'
import { useApplicationStore } from '@/stores/application'
import { STORAGE_KEYS } from '@/utils/db'
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
const showApiKey = ref(false)

// UI 状态
const saving = ref(false)
const testing = ref(false)
const testResult = ref<'success' | 'fail' | null>(null)
const testMessage = ref('')
const saveSuccess = ref(false)
const confirmingClear = ref(false)

onMounted(() => {
  provider.value = aiStore.config.provider
  apiKey.value = aiStore.config.apiKey
  baseUrl.value = aiStore.config.baseUrl
  model.value = aiStore.config.model
  resumeStore.loadResumes()
  applicationStore.loadApplications()
})

function onProviderChange() {
  if (provider.value === 'deepseek') {
    baseUrl.value = 'https://api.deepseek.com/v1'
    model.value = 'deepseek-chat'
  }
}

function saveConfig() {
  saving.value = true
  aiStore.saveConfig({
    provider: provider.value,
    apiKey: apiKey.value,
    baseUrl: baseUrl.value,
    model: model.value,
  })
  saving.value = false
  saveSuccess.value = true
  setTimeout(() => { saveSuccess.value = false }, 3000)
}

async function testConnection() {
  testing.value = true
  testResult.value = null
  // 先保存配置，确保测试使用最新配置
  aiStore.saveConfig({
    provider: provider.value,
    apiKey: apiKey.value,
    baseUrl: baseUrl.value,
    model: model.value,
  })
  const ok = await aiStore.testConnection()
  testResult.value = ok ? 'success' : 'fail'
  testMessage.value = ok ? '连接成功' : '连接失败，请检查配置'
  testing.value = false
}

function exportData() {
  const data: Record<string, unknown> = {}
  const keys = Object.values(STORAGE_KEYS)
  for (const key of keys) {
    try {
      data[key] = JSON.parse(localStorage.getItem(key) || 'null')
    } catch {
      data[key] = null
    }
  }
  data._exportedAt = new Date().toISOString()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `job-assistant-backup-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function clearAllData() {
  if (!confirmingClear.value) {
    confirmingClear.value = true
    setTimeout(() => { confirmingClear.value = false }, 5000)
    return
  }
  localStorage.removeItem(STORAGE_KEYS.RESUMES)
  localStorage.removeItem(STORAGE_KEYS.APPLICATIONS)
  localStorage.removeItem(STORAGE_KEYS.AI_CONFIG)
  // 重置为默认配置
  const defaultConfig = {
    provider: 'deepseek' as const,
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  }
  aiStore.saveConfig(defaultConfig)
  provider.value = defaultConfig.provider
  apiKey.value = ''
  baseUrl.value = defaultConfig.baseUrl
  model.value = defaultConfig.model
  resumeStore.loadResumes()
  applicationStore.loadApplications()
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
          <p class="text-xs text-gray-500 mb-5">所有数据存储在浏览器本地</p>

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
                所有数据（简历、投递记录、AI 配置）均存储在浏览器本地（localStorage），不会上传到任何服务器。清空浏览器缓存将导致数据丢失，请定期使用"导出数据"功能备份。
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
