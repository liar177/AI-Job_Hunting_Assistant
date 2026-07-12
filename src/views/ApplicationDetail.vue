<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application'
import { useResumeStore } from '@/stores/resume'
import { STATUS_OPTIONS, getStatusOption, formatDate } from '@/utils/constants'
import { renderMarkdown } from '@/utils/markdown'
import {
  downloadInterviewIcs,
  formatInterviewDateTime,
  fromDateTimeLocalValue,
  getCurrentInterview,
  getInterviewModeLabel,
  getInterviewStageLabel,
  hasCompleteInterview,
  INTERVIEW_MODE_OPTIONS,
  isInterviewStage,
  toDateTimeLocalValue,
} from '@/utils/interview'
import { ElMessageBox, ElMessage } from 'element-plus'
import type { ApplicationStatus, InterviewMode, InterviewStage, Resume } from '@/types'
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Building,
  FileText,
  Trash2,
  Save,
  Pencil,
  ChevronDown,
  Clock,
  MapPin,
  Video,
  Bell,
  User,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const store = useApplicationStore()
const resumeStore = useResumeStore()

const notesEditing = ref(false)
const notesInput = ref('')
const statusDropdownOpen = ref(false)
const interviewEditing = ref(false)
const interviewForm = ref({
  interviewAt: '',
  mode: 'online' as InterviewMode,
  location: '',
  interviewer: '',
})

const app = computed(() => store.currentApplication)
const activeStage = computed<InterviewStage | null>(() =>
  app.value && isInterviewStage(app.value.status) ? app.value.status : null
)
const activeInterview = computed(() => (app.value ? getCurrentInterview(app.value) : undefined))
const renderedJobDesc = computed(() => (app.value ? renderMarkdown(app.value.jobDescription || '') : ''))
const relatedResume = computed<Resume | undefined>(() =>
  app.value ? resumeStore.resumes.find((r) => r.id === app.value!.resumeId) : undefined
)

function nowDateTimeLocal(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}

function syncInterviewForm() {
  const schedule = activeInterview.value
  interviewForm.value = {
    interviewAt: toDateTimeLocalValue(schedule?.interviewAt) || nowDateTimeLocal(),
    mode: schedule?.mode || 'online',
    location: schedule?.location || '',
    interviewer: schedule?.interviewer || '',
  }
}

async function loadApplicationData(id: string) {
  const loaded = await store.loadApplication(id)
  if (!loaded) {
    router.push('/applications')
    return
  }
  syncInterviewForm()
}

onMounted(() => {
  resumeStore.loadResumes()
  loadApplicationData(route.params.id as string)
})

watch(() => route.params.id, (newId) => {
  if (newId) loadApplicationData(newId as string)
})

watch(() => app.value?.status, () => {
  syncInterviewForm()
})

function goBack() {
  router.push('/applications')
}

async function selectStatus(status: ApplicationStatus) {
  if (!app.value) return
  await store.updateStatus(app.value.id, status)
  statusDropdownOpen.value = false
  if (isInterviewStage(status)) {
    interviewEditing.value = !hasCompleteInterview(getCurrentInterview(store.currentApplication!))
    syncInterviewForm()
  }
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

function startEditInterview() {
  syncInterviewForm()
  interviewEditing.value = true
}

function cancelEditInterview() {
  syncInterviewForm()
  interviewEditing.value = false
}

async function saveInterview() {
  if (!app.value || !activeStage.value) return
  if (!interviewForm.value.interviewAt || !interviewForm.value.location.trim()) {
    ElMessage.warning('请填写面试时间和地点/会议软件')
    return
  }

  const schedule = {
    interviewAt: fromDateTimeLocalValue(interviewForm.value.interviewAt),
    mode: interviewForm.value.mode,
    location: interviewForm.value.location.trim(),
    interviewer: interviewForm.value.interviewer.trim() || undefined,
    calendarReminderStatus: 'created' as const,
    updatedAt: new Date().toISOString(),
  }
  const updatedInterviews = {
    ...(app.value.interviews || {}),
    [activeStage.value]: schedule,
  }
  const updated = await store.updateApplication(app.value.id, { interviews: updatedInterviews })
  if (updated) {
    interviewEditing.value = false
    ElMessage.success('面试安排已保存，将在面试前 1 天和 3 小时通过桌面通知提醒你')
  }
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
      <div class="lg:col-span-2 space-y-4">
        <section class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center justify-between gap-3 mb-4">
            <div>
              <div class="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Calendar class="w-4 h-4 text-primary" />面试安排
              </div>
              <p class="text-xs text-gray-400 mt-1">技术面、HR 面、Boss 面会分别保存对应安排</p>
            </div>
            <button
              v-if="activeStage && !interviewEditing"
              @click="startEditInterview"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <Pencil class="w-3.5 h-3.5" />
              {{ activeInterview ? '修改安排' : '填写安排' }}
            </button>
          </div>

          <div v-if="!activeStage" class="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
            当前状态不是面试阶段。切换到技术面、HR 面或 Boss 面后即可填写面试时间、形式、地点和面试官。
          </div>

          <template v-else-if="interviewEditing">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">
                  {{ getInterviewStageLabel(activeStage) }}时间 *
                </label>
                <el-date-picker
                  v-model="interviewForm.interviewAt"
                  type="datetime"
                  value-format="YYYY-MM-DDTHH:mm"
                  :placeholder="'选择日期时间'"
                  class="w-full"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">线上或线下 *</label>
                <el-select v-model="interviewForm.mode" class="w-full">
                  <el-option
                    v-for="opt in INTERVIEW_MODE_OPTIONS"
                    :key="opt.value"
                    :value="opt.value"
                    :label="opt.label"
                  />
                </el-select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">
                  {{ interviewForm.mode === 'online' ? '会议软件/链接 *' : '面试地点 *' }}
                </label>
                <el-input
                  v-model="interviewForm.location"
                  :placeholder="interviewForm.mode === 'online' ? '例如：腾讯会议 / 飞书会议' : '例如：北京望京 SOHO A 座'"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">面试官</label>
                <el-input
                  v-model="interviewForm.interviewer"
                  placeholder="例如：李工 / 王 HR"
                />
              </div>
            </div>
            <div class="mt-4 rounded-lg bg-primary-50 border border-primary-100 px-3 py-2 text-xs text-primary">
              保存后将通过桌面通知提醒你，分别在面试前 1 天和 3 小时各提醒一次。
            </div>
            <div class="flex items-center justify-end gap-2 mt-4">
              <button
                @click="cancelEditInterview"
                class="px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                @click="saveInterview"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent-dark transition-colors"
              >
                <Save class="w-3.5 h-3.5" />保存安排
              </button>
            </div>
          </template>

          <div v-else-if="activeInterview" class="rounded-lg border border-primary-100 bg-primary-50/60 p-4">
            <div class="flex flex-wrap items-center gap-2 mb-3">
              <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', getStatusOption(activeStage).color]">
                {{ getInterviewStageLabel(activeStage) }}
              </span>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white text-primary border border-primary-100">
                {{ getInterviewModeLabel(activeInterview.mode) }}
              </span>
              <span
                v-if="activeInterview.calendarReminderStatus === 'created'"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100"
              >
                <Bell class="w-3 h-3" />已加提醒
              </span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div class="flex items-center gap-2 text-gray-700">
                <Clock class="w-4 h-4 text-primary" />
                {{ formatInterviewDateTime(activeInterview.interviewAt) }}
              </div>
              <div class="flex items-center gap-2 text-gray-700">
                <component :is="activeInterview.mode === 'online' ? Video : MapPin" class="w-4 h-4 text-primary" />
                {{ activeInterview.location }}
              </div>
              <div class="flex items-center gap-2 text-gray-700">
                <User class="w-4 h-4 text-primary" />
                {{ activeInterview.interviewer || '面试官待定' }}
              </div>
            </div>
            <div class="mt-3 flex items-center justify-end">
              <button
                @click="downloadInterviewIcs(app, activeStage, activeInterview)"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                <Bell class="w-3.5 h-3.5" />导出 ICS 日历文件
              </button>
            </div>
          </div>

          <div v-else class="rounded-lg border border-amber-100 bg-amber-50 px-4 py-4 text-sm text-amber-700">
            当前已进入{{ getInterviewStageLabel(activeStage) }}，还没有填写面试时间和地点。
          </div>
        </section>

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

        <section class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <Building class="w-4 h-4 text-primary" />公司信息
          </div>
          <p v-if="app.companyInfo" class="text-sm text-gray-700 whitespace-pre-wrap break-words">{{ app.companyInfo }}</p>
          <p v-else class="text-sm text-gray-400">暂无公司信息</p>
        </section>

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
            <el-input
              v-model="notesInput"
              type="textarea"
              :rows="4"
              placeholder="添加备注..."
            />
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

      <aside class="space-y-4">
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

        <section class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <Calendar class="w-4 h-4 text-primary" />投递信息
          </div>
          <ul class="space-y-2 text-sm">
            <li class="flex justify-between gap-4">
              <span class="text-gray-500">投递时间</span>
              <span class="text-gray-700">{{ formatDate(app.appliedAt) }}</span>
            </li>
            <li class="flex justify-between gap-4">
              <span class="text-gray-500">最后更新</span>
              <span class="text-gray-700">{{ formatDate(app.updatedAt) }}</span>
            </li>
            <li class="flex justify-between gap-4">
              <span class="text-gray-500">当前状态</span>
              <span
                :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', getStatusOption(app.status).color]"
              >
                {{ getStatusOption(app.status).label }}
              </span>
            </li>
          </ul>
        </section>

        <section v-if="activeStage" class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <Bell class="w-4 h-4 text-primary" />默认提醒
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <span class="text-gray-600">提前 1 天</span>
              <span class="text-xs text-emerald-700">开启</span>
            </div>
            <div class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <span class="text-gray-600">提前 3 小时</span>
              <span class="text-xs text-emerald-700">开启</span>
            </div>
          </div>
        </section>

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
