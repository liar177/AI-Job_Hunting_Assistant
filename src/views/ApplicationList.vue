<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useApplicationStore } from '@/stores/application'
import { useResumeStore } from '@/stores/resume'
import { STATUS_OPTIONS, getStatusOption, formatDate } from '@/utils/constants'
import { ElMessageBox, ElMessage } from 'element-plus'
import type { ApplicationStatus } from '@/types'
import {
  Plus, Search, Briefcase, X, Send, TrendingUp, Trophy, XCircle, Trash2,
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const store = useApplicationStore()
const resumeStore = useResumeStore()

// 新建模态框
const showModal = ref(false)
const form = ref({
  companyName: '',
  jobTitle: '',
  jobDescription: '',
  companyInfo: '',
  resumeId: '',
  notes: '',
})

// 筛选标签：全部 + 所有状态
const tabs: { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
]

const hasApplications = computed(() => store.applications.length > 0)
const isFiltering = computed(() =>
  store.filterStatus !== 'all' || store.searchQuery.trim().length > 0
)

onMounted(() => {
  store.loadApplications()
  resumeStore.loadResumes()
  // 检查URL参数，如果有预填信息则打开模态框
  const companyName = route.query.companyName as string
  const jobTitle = route.query.jobTitle as string
  const resumeId = route.query.resumeId as string
  if (companyName || jobTitle || resumeId) {
    form.value = {
      companyName: companyName || '',
      jobTitle: jobTitle || '',
      jobDescription: '',
      companyInfo: '',
      resumeId: resumeId || '',
      notes: '',
    }
    showModal.value = true
  }
})

function openModal() {
  form.value = {
    companyName: '', jobTitle: '', jobDescription: '',
    companyInfo: '', resumeId: '', notes: '',
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

function submitCreate() {
  if (!form.value.companyName.trim() || !form.value.jobTitle.trim() || !form.value.resumeId) return
  const app = store.createApplication({
    companyName: form.value.companyName.trim(),
    jobTitle: form.value.jobTitle.trim(),
    jobDescription: form.value.jobDescription,
    companyInfo: form.value.companyInfo,
    resumeId: form.value.resumeId,
    notes: form.value.notes,
  })
  showModal.value = false
  router.push(`/applications/${app.id}`)
}

function viewDetail(id: string) {
  router.push(`/applications/${id}`)
}

function handleDelete(id: string, companyName: string, jobTitle: string, event: Event) {
  event.stopPropagation()
  ElMessageBox.confirm(
    `确定删除投递记录「${companyName} - ${jobTitle}」吗？此操作不可恢复。`,
    '确认删除',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(() => {
    store.deleteApplication(id)
    ElMessage.success('删除成功')
  }).catch(() => {})
}
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- 顶部标题栏 -->
    <header class="flex items-center justify-between px-8 py-6 bg-white border-b border-gray-100">
      <div>
        <h1 class="text-2xl font-semibold text-primary">投递管理</h1>
        <p class="text-sm text-gray-500 mt-1">跟踪每次投递的进度与反馈</p>
      </div>
      <button
        @click="openModal"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-700 transition-colors"
      >
        <Plus class="w-4 h-4" />
        新建投递
      </button>
    </header>

    <main class="flex-1 overflow-auto px-8 py-6">
      <!-- 统计卡片 -->
      <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium mb-2">
            <Send class="w-3.5 h-3.5" />总投递数
          </div>
          <div class="text-2xl font-semibold text-gray-800">{{ store.stats.total }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium mb-2">
            <TrendingUp class="w-3.5 h-3.5" />面试中
          </div>
          <div class="text-2xl font-semibold text-purple-600">{{ store.stats.interviewing }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium mb-2">
            <Trophy class="w-3.5 h-3.5" />已Offer
          </div>
          <div class="text-2xl font-semibold text-green-600">{{ store.stats.offer }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium mb-2">
            <XCircle class="w-3.5 h-3.5" />已挂
          </div>
          <div class="text-2xl font-semibold text-red-600">{{ store.stats.rejected }}</div>
        </div>
      </section>

      <!-- 搜索 + 筛选 -->
      <section class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div class="relative mb-3">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            v-model="store.searchQuery"
            type="text"
            placeholder="搜索公司名或职位..."
            class="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            @click="store.filterStatus = tab.value"
            :class="[
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              store.filterStatus === tab.value
                ? 'bg-primary text-white'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
            ]"
          >
            {{ tab.label }}
          </button>
        </div>
      </section>

      <!-- 列表 -->
      <section v-if="store.filteredApplications.length > 0" class="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <ul class="divide-y divide-gray-50">
          <li
            v-for="app in store.filteredApplications"
            :key="app.id"
            @click="viewDetail(app.id)"
            class="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <div class="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
              <Briefcase class="w-5 h-5 text-primary" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-800 truncate">{{ app.companyName }}</span>
                <span
                  :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', getStatusOption(app.status).color]"
                >
                  {{ getStatusOption(app.status).label }}
                </span>
              </div>
              <div class="text-sm text-gray-500 truncate mt-0.5">{{ app.jobTitle }}</div>
            </div>
            <div class="text-xs text-gray-400 flex-shrink-0">{{ formatDate(app.appliedAt) }}</div>
            <button
              @click="handleDelete(app.id, app.companyName, app.jobTitle, $event)"
              class="p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </li>
        </ul>
      </section>

      <!-- 空状态 -->
      <div
        v-else
        class="flex flex-col items-center justify-center py-24"
      >
        <div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Briefcase class="w-10 h-10 text-gray-400" />
        </div>
        <h3 class="text-lg font-medium text-gray-700">{{ hasApplications && isFiltering ? '没有匹配的投递记录' : '还没有投递记录' }}</h3>
        <p class="text-sm text-gray-500 mt-1 mb-6">
          {{ hasApplications && isFiltering ? '换个关键词或筛选条件试试' : '新建一条投递，开始追踪进度' }}
        </p>
        <button
          v-if="!hasApplications"
          @click="openModal"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          新建投递
        </button>
      </div>
    </main>

    <!-- 新建模态框 -->
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-800">新建投递</h2>
          <button
            @click="closeModal"
            class="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">公司名称 *</label>
              <input
                v-model="form.companyName"
                type="text"
                placeholder="例如：字节跳动"
                class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">职位名称 *</label>
              <input
                v-model="form.jobTitle"
                type="text"
                placeholder="例如：前端工程师"
                class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">选择简历 *</label>
            <select
              v-model="form.resumeId"
              class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="" disabled>请选择简历</option>
              <option v-for="r in resumeStore.resumes" :key="r.id" :value="r.id">{{ r.title }}</option>
            </select>
            <p v-if="resumeStore.resumes.length === 0" class="text-xs text-amber-600 mt-1">还没有简历，请先去简历管理创建</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">岗位描述</label>
            <textarea
              v-model="form.jobDescription"
              rows="4"
              placeholder="粘贴 JD 内容..."
              class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y"
            ></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">公司信息</label>
            <textarea
              v-model="form.companyInfo"
              rows="3"
              placeholder="公司规模、地点、业务等..."
              class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y"
            ></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">备注</label>
            <input
              v-model="form.notes"
              type="text"
              placeholder="投递渠道、内推人等..."
              class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            @click="closeModal"
            class="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-white transition-colors"
          >
            取消
          </button>
          <button
            @click="submitCreate"
            :disabled="!form.companyName.trim() || !form.jobTitle.trim() || !form.resumeId"
            class="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  </div>
</template>


