<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import { useApplicationStore } from '@/stores/application'
import { useAIStore } from '@/stores/ai'
import { getStatusOption, formatDate } from '@/utils/constants'
import {
  FileText,
  Briefcase,
  Wand2,
  CheckCircle,
  Clock,
  Settings,
  ArrowRight,
} from 'lucide-vue-next'

const router = useRouter()
const resumeStore = useResumeStore()
const applicationStore = useApplicationStore()
const aiStore = useAIStore()

// 最近的投递记录（最多5条）
const recentApplications = computed(() => applicationStore.applications.slice(0, 5))

// AI配置状态
const aiConfigured = computed(() => !!aiStore.config.apiKey)

onMounted(() => {
  resumeStore.loadResumes()
  applicationStore.loadApplications()
})

// 快捷操作
const quickActions = [
  { name: '新建简历', desc: '创建新的简历版本', icon: FileText, path: '/resumes', color: 'text-blue-600 bg-blue-50' },
  { name: 'AI定制简历', desc: '根据岗位智能生成', icon: Wand2, path: '/customize', color: 'text-accent bg-teal-50' },
  { name: '记录投递', desc: '跟踪求职进度', icon: Briefcase, path: '/applications', color: 'text-indigo-600 bg-indigo-50' },
  { name: 'AI设置', desc: '配置API密钥', icon: Settings, path: '/settings', color: 'text-gray-600 bg-gray-50' },
]
</script>

<template>
  <div class="p-8 max-w-6xl mx-auto">
    <!-- 欢迎区域 -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">欢迎回来 👋</h1>
      <p class="text-gray-500">让AI助你拿到心仪的Offer</p>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-4 gap-4 mb-8">
      <!-- 简历数 -->
      <div class="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <FileText class="w-5 h-5 text-blue-600" />
          </div>
          <span class="text-2xl font-bold text-gray-900">{{ resumeStore.resumes.length }}</span>
        </div>
        <p class="text-sm text-gray-500">简历总数</p>
      </div>

      <!-- 投递数 -->
      <div class="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <div class="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Briefcase class="w-5 h-5 text-indigo-600" />
          </div>
          <span class="text-2xl font-bold text-gray-900">{{ applicationStore.stats.total }}</span>
        </div>
        <p class="text-sm text-gray-500">投递总数</p>
      </div>

      <!-- 面试中 -->
      <div class="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <div class="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <Clock class="w-5 h-5 text-amber-600" />
          </div>
          <span class="text-2xl font-bold text-gray-900">{{ applicationStore.stats.interviewing }}</span>
        </div>
        <p class="text-sm text-gray-500">面试中</p>
      </div>

      <!-- 已Offer -->
      <div class="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <div class="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
            <CheckCircle class="w-5 h-5 text-green-600" />
          </div>
          <span class="text-2xl font-bold text-gray-900">{{ applicationStore.stats.offer }}</span>
        </div>
        <p class="text-sm text-gray-500">已获Offer</p>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="mb-8">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">快捷操作</h2>
      <div class="grid grid-cols-4 gap-4">
        <button
          v-for="action in quickActions"
          :key="action.path"
          @click="router.push(action.path)"
          class="bg-white border border-gray-100 rounded-xl p-5 text-left hover:shadow-md hover:border-primary-200 transition-all group"
        >
          <div :class="['w-10 h-10 rounded-lg flex items-center justify-center mb-3', action.color]">
            <component :is="action.icon" class="w-5 h-5" />
          </div>
          <h3 class="font-medium text-gray-900 mb-1 group-hover:text-primary transition-colors">
            {{ action.name }}
          </h3>
          <p class="text-xs text-gray-400">{{ action.desc }}</p>
        </button>
      </div>
    </div>

    <!-- AI配置提示 -->
    <div v-if="!aiConfigured" class="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
          <Settings class="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <p class="font-medium text-amber-900">AI功能未配置</p>
          <p class="text-sm text-amber-700">配置API Key后即可使用AI智能简历定制功能</p>
        </div>
      </div>
      <button
        @click="router.push('/settings')"
        class="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
      >
        去配置
      </button>
    </div>

    <!-- 最近投递 -->
    <div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">最近投递</h2>
        <button
          v-if="applicationStore.applications.length > 0"
          @click="router.push('/applications')"
          class="text-sm text-primary hover:text-primary-700 flex items-center gap-1 transition-colors"
        >
          查看全部
          <ArrowRight class="w-4 h-4" />
        </button>
      </div>

      <!-- 空状态 -->
      <div v-if="recentApplications.length === 0" class="bg-white border border-gray-100 rounded-xl p-12 text-center">
        <Briefcase class="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500 mb-4">还没有投递记录</p>
        <button
          @click="router.push('/applications')"
          class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          添加投递记录
        </button>
      </div>

      <!-- 投递列表 -->
      <div v-else class="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
        <div
          v-for="app in recentApplications"
          :key="app.id"
          @click="router.push(`/applications/${app.id}`)"
          class="p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
              <Briefcase class="w-5 h-5 text-primary" />
            </div>
            <div>
              <p class="font-medium text-gray-900">{{ app.companyName }}</p>
              <p class="text-sm text-gray-500">{{ app.jobTitle }}</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <span
              :class="['px-2.5 py-1 rounded-full text-xs font-medium border', getStatusOption(app.status).color]"
            >
              {{ getStatusOption(app.status).label }}
            </span>
            <span class="text-xs text-gray-400">{{ formatDate(app.appliedAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
