<script setup lang="ts">
defineOptions({ inheritAttrs: false })

import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus/es'
import { useApplicationStatusStore } from '@/stores/application-status'
import { useApplicationStore } from '@/stores/application'
import { STATUS_COLOR_CLASSES, STATUS_COLOR_OPTIONS } from '@/utils/constants'
import { useBackdropClose } from '@/composables/useBackdropClose'
import type {
  ApplicationStatusDefinition,
  ApplicationStatusInput,
  StatusColor,
} from '@/types'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  LockKeyhole,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-vue-next'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const statusStore = useApplicationStatusStore()
const applicationStore = useApplicationStore()
const systemExpanded = ref(false)
const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const submitting = ref(false)
const errorMessage = ref('')

const form = reactive<ApplicationStatusInput>({
  name: '',
  description: '',
  color: 'purple',
  requiresInterviewSchedule: false,
})

const visibleSystemStatuses = computed(() =>
  systemExpanded.value ? statusStore.systemStatuses : statusStore.systemStatuses.slice(0, 1)
)
const hiddenSystemCount = computed(() => Math.max(0, statusStore.systemStatuses.length - 1))
const canSubmit = computed(() => Boolean(form.name.trim() && form.description.trim()) && !submitting.value)

watch(() => props.modelValue, async (open) => {
  if (!open) return
  systemExpanded.value = false
  if (!statusStore.statuses.length) await statusStore.loadStatuses()
  if (!applicationStore.applications.length) await applicationStore.loadApplications()
})

function closeManager() {
  if (editorOpen.value) return
  emit('update:modelValue', false)
}

function resetForm(status?: ApplicationStatusDefinition) {
  editingId.value = status?.id || null
  form.name = status?.name || ''
  form.description = status?.description || ''
  form.color = status?.color || 'purple'
  form.requiresInterviewSchedule = status?.requiresInterviewSchedule || false
  errorMessage.value = ''
}

function openCreate() {
  resetForm()
  editorOpen.value = true
}

function openEdit(status: ApplicationStatusDefinition) {
  resetForm(status)
  editorOpen.value = true
}

function closeEditor() {
  if (submitting.value) return
  editorOpen.value = false
  errorMessage.value = ''
}

const managerBackdrop = useBackdropClose(closeManager)
const editorBackdrop = useBackdropClose(closeEditor)

async function saveStatus() {
  if (!canSubmit.value) {
    errorMessage.value = '请填写状态名称和状态描述'
    return
  }
  submitting.value = true
  errorMessage.value = ''
  const data: ApplicationStatusInput = {
    name: form.name.trim(),
    description: form.description.trim(),
    color: form.color,
    requiresInterviewSchedule: form.requiresInterviewSchedule,
  }
  try {
    if (editingId.value) {
      await statusStore.updateStatus(editingId.value, data)
      ElMessage.success('状态已更新')
    } else {
      await statusStore.createStatus(data)
      ElMessage.success('自定义状态已创建')
    }
    editorOpen.value = false
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    submitting.value = false
  }
}

function usageCount(statusId: string) {
  return applicationStore.applications.filter((application) => application.status === statusId).length
}

async function deleteStatus(status: ApplicationStatusDefinition) {
  const count = usageCount(status.id)
  if (count > 0) {
    ElMessage.warning(`该状态正被 ${count} 条投递记录使用，请先迁移这些投递`)
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除自定义状态「${status.name}」吗？`,
      '删除状态',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await statusStore.deleteStatus(status.id)
    ElMessage.success('状态已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  }
}

function selectColor(color: StatusColor) {
  form.color = color
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      @pointerdown="managerBackdrop.onBackdropPointerDown"
      @pointerup="managerBackdrop.onBackdropPointerUp"
      @pointercancel="managerBackdrop.onBackdropPointerCancel"
      @click="managerBackdrop.onBackdropClick"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-manager-title"
        class="flex w-full max-w-3xl max-h-[calc(100vh-64px)] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <header class="flex items-start justify-between gap-5 border-b border-gray-100 px-7 py-5">
          <div>
            <h2 id="status-manager-title" class="text-lg font-semibold text-gray-800">投递状态设置</h2>
            <p class="mt-1 text-xs leading-5 text-gray-400">管理投递流程中可选择的状态，以及是否需要填写面试安排。</p>
          </div>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-50"
              @click="openCreate"
            >
              <Plus class="h-4 w-4" />新增自定义状态
            </button>
            <button type="button" aria-label="关闭状态设置" class="rounded-md p-1.5 text-gray-400 hover:bg-gray-100" @click="closeManager">
              <X class="h-5 w-5" />
            </button>
          </div>
        </header>

        <div class="flex-1 overflow-y-auto px-7 py-5">
          <div class="mb-3 flex items-center gap-2">
            <h3 class="text-base font-semibold text-gray-800">系统状态</h3>
            <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-400">不可删除</span>
          </div>
          <div class="overflow-hidden rounded-lg border border-gray-200">
            <div
              v-for="status in visibleSystemStatuses"
              :key="status.id"
              class="grid grid-cols-[120px_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
            >
              <span :class="['w-fit rounded-md border px-2.5 py-1 text-xs font-medium', STATUS_COLOR_CLASSES[status.color]]">{{ status.name }}</span>
              <span class="truncate text-sm text-gray-500">{{ status.description }}</span>
              <span v-if="status.requiresInterviewSchedule" class="rounded-md bg-purple-50 px-2 py-1 text-[11px] text-purple-600">需要面试安排</span>
              <LockKeyhole class="h-4 w-4 text-gray-400" />
            </div>
            <button
              v-if="hiddenSystemCount > 0"
              type="button"
              class="flex w-full items-center gap-1.5 px-4 py-3 text-left text-xs text-gray-500 transition-colors hover:bg-gray-50"
              @click="systemExpanded = !systemExpanded"
            >
              {{ systemExpanded ? '收起系统状态' : `其余 ${hiddenSystemCount} 个系统状态` }}
              <ChevronUp v-if="systemExpanded" class="h-3.5 w-3.5" />
              <ChevronDown v-else class="h-3.5 w-3.5" />
            </button>
          </div>

          <div class="mb-3 mt-6 flex items-center gap-2">
            <h3 class="text-base font-semibold text-gray-800">自定义状态</h3>
            <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{{ statusStore.customStatuses.length }}</span>
          </div>
          <div v-if="statusStore.customStatuses.length" class="overflow-hidden rounded-lg border border-gray-200">
            <div
              v-for="status in statusStore.customStatuses"
              :key="status.id"
              class="grid grid-cols-[120px_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
            >
              <span :class="['w-fit rounded-md border px-2.5 py-1 text-xs font-medium', STATUS_COLOR_CLASSES[status.color]]">{{ status.name }}</span>
              <span class="truncate text-sm text-gray-500" :title="status.description">{{ status.description }}</span>
              <span :class="['rounded-md px-2 py-1 text-[11px]', status.requiresInterviewSchedule ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-400']">
                {{ status.requiresInterviewSchedule ? '需要面试安排' : '无需面试安排' }}
              </span>
              <div class="flex items-center gap-1">
                <button type="button" :aria-label="`编辑状态 ${status.name}`" class="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary" @click="openEdit(status)">
                  <Pencil class="h-4 w-4" />
                </button>
                <button type="button" :aria-label="`删除状态 ${status.name}`" class="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" @click="deleteStatus(status)">
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div v-else class="rounded-lg border border-dashed border-gray-200 px-4 py-7 text-center text-sm text-gray-400">
            暂无自定义状态，可以通过右上角按钮新增。
          </div>
        </div>

        <footer class="flex items-center justify-between gap-4 border-t border-gray-100 bg-gray-50 px-7 py-4">
          <p class="flex items-center gap-1.5 text-xs text-gray-400">
            <Info class="h-4 w-4" />被投递记录使用的状态需要先完成状态迁移后才能删除。
          </p>
          <button type="button" class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700" @click="closeManager">完成</button>
        </footer>
      </section>
    </div>

    <div
      v-if="modelValue && editorOpen"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4"
      @pointerdown="editorBackdrop.onBackdropPointerDown"
      @pointerup="editorBackdrop.onBackdropPointerUp"
      @pointercancel="editorBackdrop.onBackdropPointerCancel"
      @click="editorBackdrop.onBackdropClick"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-editor-title"
        class="flex w-full max-w-[470px] max-h-[calc(100vh-64px)] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <header class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 id="status-editor-title" class="text-lg font-semibold text-gray-800">{{ editingId ? '编辑自定义状态' : '新增自定义状态' }}</h2>
          <button type="button" aria-label="关闭状态编辑" class="rounded-md p-1 text-gray-400 hover:bg-gray-100" @click="closeEditor"><X class="h-5 w-5" /></button>
        </header>
        <div class="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700">状态名称 *</label>
            <el-input v-model="form.name" maxlength="12" show-word-limit placeholder="例如：笔试" />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700">状态描述 *</label>
            <el-input v-model="form.description" type="textarea" :rows="3" maxlength="80" show-word-limit placeholder="帮助理解这个投递状态的含义" />
          </div>
          <div class="flex items-start justify-between gap-5">
            <div>
              <label class="block text-sm font-medium text-gray-700">需要填写面试安排</label>
              <p class="mt-1 text-xs leading-5 text-gray-400">开启后，使用此状态时需填写时间、形式和地点。</p>
            </div>
            <el-switch v-model="form.requiresInterviewSchedule" aria-label="需要填写面试安排" />
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700">状态颜色</label>
            <div class="flex flex-wrap gap-2.5">
              <button
                v-for="option in STATUS_COLOR_OPTIONS"
                :key="option.value"
                type="button"
                :title="option.label"
                :aria-label="`选择${option.label}`"
                :aria-pressed="form.color === option.value"
                :class="['flex h-9 w-9 items-center justify-center rounded-lg transition-all', option.swatch, form.color === option.value ? 'ring-2 ring-primary ring-offset-2' : 'hover:scale-105']"
                @click="selectColor(option.value)"
              >
                <Check v-if="form.color === option.value" class="h-4 w-4 text-white" />
              </button>
            </div>
            <div class="mt-3 flex items-center gap-2 text-xs text-gray-400">
              标签预览
              <span :class="['rounded-md border px-2.5 py-1 font-medium', STATUS_COLOR_CLASSES[form.color]]">{{ form.name.trim() || '状态名称' }}</span>
            </div>
          </div>
          <p v-if="errorMessage" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{{ errorMessage }}</p>
        </div>
        <footer class="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button type="button" class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-white" @click="closeEditor">取消</button>
          <button type="button" :disabled="!canSubmit" class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50" @click="saveStatus">
            {{ submitting ? '保存中...' : '保存' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
