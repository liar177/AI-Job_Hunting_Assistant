<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useApplicationStore } from '@/stores/application'
import { useResumeStore } from '@/stores/resume'
import { useApplicationStatusStore } from '@/stores/application-status'
import { getStatusOption, formatDate } from '@/utils/constants'
import StatusManagerDialog from '@/components/Application/StatusManagerDialog.vue'
import {
  buildInterviewCalendarDays,
  formatInterviewDateTime,
  formatInterviewDayLabel,
  getCurrentInterview,
  getInterviewModeLabel,
  getInterviewStageLabel,
  hasCompleteInterview,
  isInterviewStage,
  needsInterviewInfo,
} from '@/utils/interview'
import { ElMessage, ElMessageBox } from 'element-plus/es'
import type { Application, ApplicationStatus } from '@/types'
import type { InterviewItem } from '@/utils/interview'
import {
  Plus,
  Search,
  Briefcase,
  X,
  Send,
  TrendingUp,
  Trash2,
  Calendar,
  CalendarDays,
  Clock,
  MapPin,
  Video,
  List,
  GitBranch,
  AlertCircle,
  Bell,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-vue-next'

type ViewMode = 'list' | 'timeline' | 'calendar'

const router = useRouter()
const route = useRoute()
const store = useApplicationStore()
const resumeStore = useResumeStore()
const statusStore = useApplicationStatusStore()

const showModal = ref(false)
const showStatusManager = ref(false)
const viewMode = ref<ViewMode>('list')
const calendarMonth = ref(new Date())
const form = ref({
  companyName: '',
  jobTitle: '',
  jobDescription: '',
  companyInfo: '',
  resumeId: '',
  status: 'applied' as ApplicationStatus,
  notes: '',
})

const tabs = computed<{ value: ApplicationStatus | 'all'; label: string }[]>(() => [
  { value: 'all', label: '全部' },
  ...statusStore.statuses.map((status) => ({ value: status.id, label: status.name })),
])

const viewModes: { value: ViewMode; label: string; icon: typeof List }[] = [
  { value: 'list', label: '列表', icon: List },
  { value: 'timeline', label: '时间线', icon: GitBranch },
  { value: 'calendar', label: '日历', icon: CalendarDays },
]

const hasApplications = computed(() => store.applications.length > 0)
const isFiltering = computed(() =>
  store.filterStatus !== 'all' || store.searchQuery.trim().length > 0
)
const calendarDays = computed(() => buildInterviewCalendarDays(calendarMonth.value, store.interviewItems))
const calendarTitle = computed(() =>
  calendarMonth.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
)
const timelineGroups = computed(() => {
  const groups = new Map<string, InterviewItem[]>()
  store.interviewItems.forEach((item) => {
    const label = formatInterviewDayLabel(item.schedule.interviewAt)
    groups.set(label, [...(groups.get(label) || []), item])
  })
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
})

onMounted(async () => {
  if (!statusStore.statuses.length) await statusStore.loadStatuses()
  store.loadApplications()
  resumeStore.loadResumes()
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
      status: 'applied',
      notes: '',
    }
    showModal.value = true
  }
})

function openModal() {
  form.value = {
    companyName: '', jobTitle: '', jobDescription: '',
    companyInfo: '', resumeId: '', status: 'applied', notes: '',
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function submitCreate() {
  if (!form.value.companyName.trim() || !form.value.jobTitle.trim() || !form.value.resumeId) return
  const app = await store.createApplication({
    companyName: form.value.companyName.trim(),
    jobTitle: form.value.jobTitle.trim(),
    jobDescription: form.value.jobDescription,
    companyInfo: form.value.companyInfo,
    resumeId: form.value.resumeId,
    status: form.value.status,
    notes: form.value.notes,
  })
  showModal.value = false
  router.push(`/applications/${app.id}`)
}

function viewDetail(id: string) {
  router.push(`/applications/${id}`)
}

function changeMonth(offset: number) {
  const next = new Date(calendarMonth.value)
  next.setMonth(next.getMonth() + offset)
  calendarMonth.value = next
}

function getRowInterviewText(app: Application) {
  if (!isInterviewStage(app.status)) return ''
  const schedule = getCurrentInterview(app)
  if (!hasCompleteInterview(schedule)) return `${getInterviewStageLabel(app.status)} · 待补充面试信息`
  return `${getInterviewStageLabel(app.status)} · ${formatInterviewDateTime(schedule?.interviewAt)} · ${schedule?.location}`
}

function getInterviewIcon(mode?: string) {
  return mode === 'offline' ? MapPin : Video
}

function getInterviewModeColor(mode?: string) {
  if (mode === 'online') return 'bg-blue-50 text-blue-700 border-blue-100'
  if (mode === 'offline') return 'bg-orange-50 text-orange-700 border-orange-100'
  return 'bg-gray-50 text-gray-600 border-gray-100'
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
  ).then(async () => {
    await store.deleteApplication(id)
    ElMessage.success('删除成功')
  }).catch(() => {})
}
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50">
    <header class="flex items-center justify-between px-8 py-6 bg-white border-b border-gray-100">
      <div>
        <h1 class="text-2xl font-semibold text-primary">投递管理</h1>
        <p class="text-sm text-gray-500 mt-1">跟踪投递进度、面试安排与日历提醒</p>
      </div>
      <div class="flex items-center gap-3">
        <button
          @click="showStatusManager = true"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-primary text-sm font-medium hover:bg-primary-50 transition-colors"
        >
          <SlidersHorizontal class="w-4 h-4" />
          状态设置
        </button>
        <button
          @click="openModal"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          新建投递
        </button>
      </div>
    </header>

    <main class="flex-1 overflow-auto px-8 py-6">
      <section class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
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
          <div class="text-2xl font-semibold text-primary">{{ store.stats.interviewing }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium mb-2">
            <Calendar class="w-3.5 h-3.5" />近期面试
          </div>
          <div class="text-2xl font-semibold text-accent-dark">{{ store.stats.upcomingInterviews }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-5">
          <div class="flex items-center gap-2 text-gray-400 text-xs font-medium mb-2">
            <AlertCircle class="w-3.5 h-3.5" />待补充信息
          </div>
          <div class="text-2xl font-semibold text-amber-600">{{ store.stats.missingInterviewInfo }}</div>
        </div>
      </section>

      <section class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div class="flex flex-col xl:flex-row xl:items-center gap-3 mb-3">
          <div class="relative flex-1">
            <el-input
              v-model="store.searchQuery"
              placeholder="搜索公司名或职位..."
              clearable
            >
              <template #prefix>
                <Search class="w-4 h-4 text-gray-400" />
              </template>
            </el-input>
          </div>
          <div class="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              v-for="mode in viewModes"
              :key="mode.value"
              @click="viewMode = mode.value"
              :class="[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                viewMode === mode.value ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700',
              ]"
            >
              <component :is="mode.icon" class="w-3.5 h-3.5" />
              {{ mode.label }}
            </button>
          </div>
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

      <section v-if="store.upcomingInterviewItems.length > 0" class="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Clock class="w-4 h-4 text-primary" />近期面试
          </div>
          <button
            @click="viewMode = 'calendar'"
            class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-700"
          >
            日历视图
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <button
            v-for="item in store.upcomingInterviewItems"
            :key="`${item.application.id}-${item.stage}`"
            @click="viewDetail(item.application.id)"
            class="text-left rounded-lg border border-gray-100 p-3 hover:border-primary hover:bg-primary-50/40 transition-colors"
          >
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-xs font-medium text-primary">{{ formatInterviewDayLabel(item.schedule.interviewAt) }}</span>
              <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border', getInterviewModeColor(item.schedule.mode)]">
                {{ getInterviewModeLabel(item.schedule.mode) }}
              </span>
            </div>
            <div class="font-medium text-sm text-gray-800 truncate">{{ item.application.companyName }}</div>
            <div class="text-xs text-gray-500 mt-1 truncate">
              {{ getInterviewStageLabel(item.stage) }} · {{ item.schedule.interviewer || '面试官待定' }}
            </div>
            <div class="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <Clock class="w-3.5 h-3.5" />
              <span>{{ formatInterviewDateTime(item.schedule.interviewAt) }}</span>
            </div>
            <div class="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
              <component :is="getInterviewIcon(item.schedule.mode)" class="w-3.5 h-3.5" />
              <span class="truncate">{{ item.schedule.location }}</span>
            </div>
          </button>
        </div>
      </section>

      <div v-if="viewMode === 'list'" class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
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
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-medium text-gray-800 truncate">{{ app.companyName }}</span>
                  <span
                    :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0', getStatusOption(app.status).color]"
                  >
                    {{ getStatusOption(app.status).label }}
                  </span>
                </div>
                <div class="text-sm text-gray-500 truncate mt-0.5">{{ app.jobTitle }}</div>
                <div
                  v-if="isInterviewStage(app.status)"
                  :class="[
                    'inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs border',
                    needsInterviewInfo(app)
                      ? 'bg-amber-50 text-amber-700 border-amber-100'
                      : 'bg-primary-50 text-primary border-primary-100',
                  ]"
                >
                  <Clock class="w-3.5 h-3.5" />
                  {{ getRowInterviewText(app) }}
                </div>
              </div>
              <div class="hidden lg:flex flex-col items-end gap-1 text-xs text-gray-400 flex-shrink-0">
                <span>{{ formatDate(app.appliedAt) }}</span>
                <span
                  v-if="getCurrentInterview(app)?.calendarReminderStatus === 'created'"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"
                >
                  <Bell class="w-3 h-3" />已加提醒
                </span>
              </div>
              <button
                @click="handleDelete(app.id, app.companyName, app.jobTitle, $event)"
                class="p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </li>
          </ul>
        </section>

        <div
          v-else
          class="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center py-24"
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

        <aside class="bg-white rounded-xl border border-gray-100 p-4 h-fit">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <AlertCircle class="w-4 h-4 text-amber-600" />待补充信息
          </div>
          <div v-if="store.missingInterviewApplications.length > 0" class="space-y-2">
            <button
              v-for="app in store.missingInterviewApplications"
              :key="app.id"
              @click="viewDetail(app.id)"
              class="w-full text-left rounded-lg border border-amber-100 bg-amber-50/60 p-3 hover:bg-amber-50 transition-colors"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-sm text-gray-800 truncate">{{ app.companyName }}</span>
                <ChevronRight class="w-4 h-4 text-amber-600 flex-shrink-0" />
              </div>
              <div class="text-xs text-gray-500 mt-1 truncate">{{ app.jobTitle }}</div>
              <div class="text-xs text-amber-700 mt-2">
                {{ isInterviewStage(app.status) ? getInterviewStageLabel(app.status) : '面试' }} · 待补充时间/地点
              </div>
            </button>
          </div>
          <p v-else class="text-sm text-gray-400 leading-6">
            当前没有缺失的面试安排。
          </p>
        </aside>
      </div>

      <section v-else-if="viewMode === 'timeline'" class="bg-white rounded-xl border border-gray-100 p-5">
        <div class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-4">
          <GitBranch class="w-4 h-4 text-primary" />面试时间线
        </div>
        <div v-if="timelineGroups.length > 0" class="space-y-6">
          <div v-for="group in timelineGroups" :key="group.label">
            <div class="text-xs font-semibold text-gray-400 mb-3">{{ group.label }}</div>
            <div class="relative pl-6 space-y-3 before:absolute before:left-2 before:top-1 before:bottom-1 before:w-px before:bg-gray-100">
              <button
                v-for="item in group.items"
                :key="`${item.application.id}-${item.stage}`"
                @click="viewDetail(item.application.id)"
                class="relative w-full flex items-center gap-4 rounded-lg px-3 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <span class="absolute -left-[19px] top-5 w-3 h-3 rounded-full border-2 border-white bg-accent shadow-sm"></span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-medium text-gray-800 truncate">{{ item.application.companyName }}</span>
                    <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0', getStatusOption(item.stage).color]">
                      {{ getInterviewStageLabel(item.stage) }}
                    </span>
                    <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', getInterviewModeColor(item.schedule.mode)]">
                      {{ getInterviewModeLabel(item.schedule.mode) }}
                    </span>
                  </div>
                  <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>{{ item.application.jobTitle }}</span>
                    <span>面试官：{{ item.schedule.interviewer || '待定' }}</span>
                    <span>{{ formatInterviewDateTime(item.schedule.interviewAt) }}</span>
                    <span>{{ item.schedule.location }}</span>
                    <span
                      v-if="item.schedule.calendarReminderStatus === 'created'"
                      class="inline-flex items-center gap-1 text-emerald-700"
                    >
                      <Bell class="w-3 h-3" />已加提醒
                    </span>
                  </div>
                </div>
                <ChevronRight class="w-4 h-4 text-gray-300 flex-shrink-0" />
              </button>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 py-10 text-center">还没有已设置时间的面试。</p>
      </section>

      <section v-else class="bg-white rounded-xl border border-gray-100 p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-700">
            <CalendarDays class="w-4 h-4 text-primary" />面试日历
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="changeMonth(-1)"
              class="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft class="w-4 h-4" />
            </button>
            <span class="w-28 text-center text-sm font-medium text-gray-700">{{ calendarTitle }}</span>
            <button
              @click="changeMonth(1)"
              class="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <ArrowRight class="w-4 h-4" />
            </button>
          </div>
        </div>
        <div class="grid grid-cols-7 border-t border-l border-gray-100 text-xs text-gray-500">
          <div
            v-for="dayName in ['日', '一', '二', '三', '四', '五', '六']"
            :key="dayName"
            class="h-9 flex items-center justify-center border-r border-b border-gray-100 bg-gray-50 font-medium"
          >
            {{ dayName }}
          </div>
          <div
            v-for="day in calendarDays"
            :key="day.key"
            :class="[
              'min-h-[112px] border-r border-b border-gray-100 p-2',
              day.isCurrentMonth ? 'bg-white' : 'bg-gray-50/70',
            ]"
          >
            <div
              :class="[
                'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1',
                day.isToday ? 'bg-primary text-white' : day.isCurrentMonth ? 'text-gray-700' : 'text-gray-300',
              ]"
            >
              {{ day.day }}
            </div>
            <div class="space-y-1">
              <button
                v-for="item in day.interviews.slice(0, 2)"
                :key="`${day.key}-${item.application.id}-${item.stage}`"
                @click="viewDetail(item.application.id)"
                class="w-full text-left rounded-md bg-primary-50 px-2 py-1 text-[11px] leading-4 text-primary hover:bg-primary-100 transition-colors"
              >
                <div class="font-medium truncate">{{ item.application.companyName }}</div>
                <div class="truncate">{{ getInterviewStageLabel(item.stage) }} · {{ item.schedule.location }}</div>
              </button>
              <div v-if="day.interviews.length > 2" class="text-[11px] text-gray-400 px-1">
                +{{ day.interviews.length - 2 }} 场
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

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
              <el-input
                v-model="form.companyName"
                placeholder="例如：字节跳动"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">职位名称 *</label>
              <el-input
                v-model="form.jobTitle"
                placeholder="例如：前端工程师"
              />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">选择简历 *</label>
            <el-select v-model="form.resumeId" placeholder="请选择简历" class="w-full">
              <el-option
                v-for="r in resumeStore.resumes"
                :key="r.id"
                :value="r.id"
                :label="r.title"
              />
            </el-select>
            <p v-if="resumeStore.resumes.length === 0" class="text-xs text-amber-600 mt-1">还没有简历，请先去简历管理创建</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">投递状态 *</label>
            <el-select v-model="form.status" class="w-full" popper-class="status-select-dropdown">
              <el-option
                v-for="status in statusStore.statuses"
                :key="status.id"
                :value="status.id"
                :label="status.name"
              >
                <div class="py-1">
                  <div class="text-sm text-gray-700">{{ status.name }}</div>
                  <div class="max-w-[360px] truncate text-xs text-gray-400">{{ status.description }}</div>
                </div>
              </el-option>
            </el-select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">岗位描述</label>
            <el-input
              v-model="form.jobDescription"
              type="textarea"
              :rows="4"
              placeholder="粘贴 JD 内容..."
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">公司信息</label>
            <el-input
              v-model="form.companyInfo"
              type="textarea"
              :rows="3"
              placeholder="公司规模、地点、业务等..."
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">备注</label>
            <el-input
              v-model="form.notes"
              placeholder="投递渠道、内推人等..."
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

    <StatusManagerDialog v-model="showStatusManager" />
  </div>
</template>
