<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application'
import { useResumeStore } from '@/stores/resume'
import { STATUS_OPTIONS, getStatusOption, formatDate } from '@/utils/constants'
import { renderMarkdown } from '@/utils/markdown'
import { ElMessageBox, ElMessage } from 'element-plus'
import type { ApplicationStatus, Resume } from '@/types'
import {
  ArrowLeft, Briefcase, Calendar, Building, FileText,
  Trash2, Save, Pencil, ChevronDown,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const store = useApplicationStore()
const resumeStore = useResumeStore()

const notesEditing = ref(false)
const notesInput = ref('')
const statusDropdownOpen = ref(false)

const app = computed(() => store.currentApplication)
const renderedJobDesc = computed(() => (app.value ? renderMarkdown(app.value.jobDescription || '') : ''))
const relatedResume = computed<Resume | undefined>(() =>
  app.value ? resumeStore.resumes.find((r) => r.id === app.value!.resumeId) : undefined
)

async function loadApplicationData(id: string) {
  const loaded = await store.loadApplication(id)
  if (!loaded) {
    router.push('/applications')
  }
}

onMounted(() => {
  resumeStore.loadResumes()
  loadApplicationData(route.params.id as string)
})

watch(() => route.params.id, (newId) => {
  if (newId) loadApplicationData(newId as string)
})

function goBack() {
  router.push('/applications')
}

async function selectStatus(status: ApplicationStatus) {
  if (!app.value) return
  await store.updateStatus(app.value.id, status)
  statusDropdownOpen.value = false
}

function startEditNotes() {
  notesInput.value = app.value?.notes || ''
  notesEditing.value = true
}

async function saveNotes() {
  if (!app.value) return
  await store.updateApplication(app.value.id, { notes: notesInput.value })
  notesEditing.value = false
}

function cancelEditNotes() {
  notesEditing.value = false
}

function viewResume(id: string) {
  router.push(`/resumes/${id}`)
}

function handleDelete() {
  if (!app.value) return
  ElMessageBox.confirm(
    `确定删除投递记录「${app.value.companyName} - ${app.value.jobTitle}」吗？此操作不可恢复。`,
    '确认删除',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    await store.deleteApplication(app.value!.id)
    router.push('/applications')
    ElMessage.success('删除成功')
  }).catch(() => {})
}
</script>

<template>
  <div v-if="app" class="h-full flex flex-col bg-gray-50">
    <!-- 顶部栏 -->
    <header class="flex items-center gap-4 px-8 py-4 bg-white border-b border-gray-100">
      <button
        @click="goBack"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        返回
      </button>
      <div class="h-5 w-px bg-gray-200"></div>
      <div class="flex-1 min-w-0 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
          <Briefcase class="w-5 h-5 text-primary" />
        </div>
        <div class="min-w-0">
          <h1 class="text-lg font-semibold text-gray-800 truncate">{{ app.companyName }}</h1>
          <p class="text-sm text-gray-500 truncate">{{ app.jobTitle }}</p>
        </div>
      </div>
      <!-- 状态下拉 -->
      <div class="relative">
        <button
          @click="statusDropdownOpen = !statusDropdownOpen"
          :class="[
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border',
            getStatusOption(app.status).color,
          ]"
        >
          {{ getStatusOption(app.status).label }}
          <ChevronDown class="w-3.5 h-3.5" />
        </button>
        <div
          v-if="statusDropdownOpen"
          class="absolute right-0 mt-1 w-40 bg-white rounded-lg border border-gray-100 shadow-lg z-10 py-1"
        >
          <button
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            @click="selectStatus(opt.value)"
            :class="[
              'w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50',
              app.status === opt.value ? 'font-semibold text-primary' : 'text-gray-600',
            ]"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </header>

    <main class="flex-1 overflow-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- 左侧主信息 -->
      <div class="lg:col-span-2 space-y-4">
        <!-- 岗位描述 -->
        <section class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <FileText class="w-4 h-4 text-primary" />岗位描述
          </div>
          <div
            v-if="app.jobDescription"
            class="prose prose-sm max-w-none text-gray-700"
            v-html="renderedJobDesc"
          ></div>
          <p v-else class="text-sm text-gray-400">暂无岗位描述</p>
        </section>

        <!-- 公司信息 -->
        <section class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <Building class="w-4 h-4 text-primary" />公司信息
          </div>
          <p v-if="app.companyInfo" class="text-sm text-gray-700 whitespace-pre-wrap break-words">{{ app.companyInfo }}</p>
          <p v-else class="text-sm text-gray-400">暂无公司信息</p>
        </section>

        <!-- 备注 -->
        <section class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Pencil class="w-4 h-4 text-primary" />备注
            </div>
            <div class="flex items-center gap-1" v-if="!notesEditing">
              <button
                @click="startEditNotes"
                class="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <Pencil class="w-4 h-4" />
              </button>
            </div>
          </div>
          <template v-if="notesEditing">
            <textarea
              v-model="notesInput"
              rows="4"
              class="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y"
              placeholder="添加备注..."
            ></textarea>
            <div class="flex items-center justify-end gap-2 mt-2">
              <button
                @click="cancelEditNotes"
                class="px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                @click="saveNotes"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent-dark transition-colors"
              >
                <Save class="w-3.5 h-3.5" />保存
              </button>
            </div>
          </template>
          <p v-else-if="app.notes" class="text-sm text-gray-700 whitespace-pre-wrap break-words">{{ app.notes }}</p>
          <p v-else class="text-sm text-gray-400">点击右上角编辑按钮添加备注</p>
        </section>
      </div>

      <!-- 右侧侧边栏 -->
      <aside class="space-y-4">
        <!-- 关联简历 -->
        <section class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <FileText class="w-4 h-4 text-primary" />关联简历
          </div>
          <button
            v-if="relatedResume"
            @click="viewResume(relatedResume.id)"
            class="w-full text-left p-3 rounded-lg border border-gray-100 hover:border-primary hover:bg-primary-50/40 transition-colors"
          >
            <div class="font-medium text-sm text-gray-800 truncate">{{ relatedResume.title }}</div>
            <div class="text-xs text-gray-400 mt-0.5">v{{ relatedResume.version }} · {{ formatDate(relatedResume.updatedAt) }}</div>
          </button>
          <p v-else class="text-sm text-gray-400">未关联简历</p>
        </section>

        <!-- 元信息 -->
        <section class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <Calendar class="w-4 h-4 text-primary" />投递信息
          </div>
          <ul class="space-y-2 text-sm">
            <li class="flex justify-between">
              <span class="text-gray-500">投递时间</span>
              <span class="text-gray-700">{{ formatDate(app.appliedAt) }}</span>
            </li>
            <li class="flex justify-between">
              <span class="text-gray-500">最后更新</span>
              <span class="text-gray-700">{{ formatDate(app.updatedAt) }}</span>
            </li>
            <li class="flex justify-between">
              <span class="text-gray-500">当前状态</span>
              <span
                :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', getStatusOption(app.status).color]"
              >
                {{ getStatusOption(app.status).label }}
              </span>
            </li>
          </ul>
        </section>

        <!-- 危险操作 -->
        <section class="bg-white rounded-xl border border-gray-100 p-5">
          <button
            @click="handleDelete"
            class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            <Trash2 class="w-4 h-4" />删除投递记录
          </button>
        </section>
      </aside>
    </main>
  </div>
</template>
