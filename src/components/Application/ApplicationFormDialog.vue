<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApplicationStatusStore } from '@/stores/application-status'
import { useResumeStore } from '@/stores/resume'
import { useBackdropClose } from '@/composables/useBackdropClose'
import type { Application, ApplicationInput, ApplicationStatus } from '@/types'
import { X } from 'lucide-vue-next'

type FormData = Required<ApplicationInput>

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode?: 'create' | 'edit'
  application?: Application | null
  initialData?: Partial<ApplicationInput>
  saving?: boolean
}>(), {
  mode: 'create',
  application: null,
  initialData: () => ({}),
  saving: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [data: FormData]
}>()

const resumeStore = useResumeStore()
const statusStore = useApplicationStatusStore()
const form = ref<FormData>(emptyForm())

const title = computed(() => props.mode === 'edit' ? '编辑投递' : '新建投递')
const submitText = computed(() => props.mode === 'edit' ? '保存' : '创建')
const canSubmit = computed(() =>
  !!form.value.companyName.trim() &&
  !!form.value.jobTitle.trim() &&
  !!form.value.resumeId
)

function emptyForm(): FormData {
  return {
    companyName: '',
    jobTitle: '',
    jobDescription: '',
    companyInfo: '',
    resumeId: '',
    status: 'applied' as ApplicationStatus,
    notes: '',
  }
}

function resetForm() {
  const source = props.application || props.initialData
  form.value = {
    companyName: source.companyName || '',
    jobTitle: source.jobTitle || '',
    jobDescription: source.jobDescription || '',
    companyInfo: source.companyInfo || '',
    resumeId: source.resumeId || '',
    status: source.status || 'applied',
    notes: source.notes || '',
  }
}

function close() {
  if (!props.saving) emit('update:modelValue', false)
}

const backdrop = useBackdropClose(close)

function submit() {
  if (!canSubmit.value || props.saving) return
  emit('submit', {
    ...form.value,
    companyName: form.value.companyName.trim(),
    jobTitle: form.value.jobTitle.trim(),
  })
}

watch(() => props.modelValue, (open) => {
  if (open) resetForm()
}, { immediate: true })
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    @pointerdown="backdrop.onBackdropPointerDown"
    @pointerup="backdrop.onBackdropPointerUp"
    @pointercancel="backdrop.onBackdropPointerCancel"
    @click="backdrop.onBackdropClick"
  >
    <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 class="text-lg font-semibold text-gray-800">{{ title }}</h2>
        <button
          :disabled="saving"
          @click="close"
          class="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50"
          aria-label="关闭"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">公司名称 *</label>
            <el-input v-model="form.companyName" placeholder="例如：字节跳动" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">职位名称 *</label>
            <el-input v-model="form.jobTitle" placeholder="例如：前端工程师" />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">选择简历 *</label>
          <el-select v-model="form.resumeId" placeholder="请选择简历" class="w-full">
            <el-option
              v-for="resume in resumeStore.resumes"
              :key="resume.id"
              :value="resume.id"
              :label="resume.title"
            />
          </el-select>
          <p v-if="resumeStore.resumes.length === 0" class="text-xs text-amber-600 mt-1">
            还没有简历，请先去简历管理创建
          </p>
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
            type="textarea"
            :rows="2"
            placeholder="投递渠道、内推人等..."
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
        <button
          :disabled="saving"
          @click="close"
          class="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
        >
          取消
        </button>
        <button
          :disabled="!canSubmit || saving"
          @click="submit"
          class="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ saving ? '保存中...' : submitText }}
        </button>
      </div>
    </div>
  </div>
</template>
