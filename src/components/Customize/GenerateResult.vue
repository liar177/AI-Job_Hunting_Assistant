<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import { downloadMarkdown, downloadText } from '@/utils/markdown'
import {
  Loader2, Save, FileDown, AlertCircle, CheckCircle, FileText, Eye,
} from 'lucide-vue-next'

const props = defineProps<{
  generating: boolean
  errorMsg: string
  content: string
  savedSuccess: boolean
  companyName: string
  jobTitle: string
}>()

const emit = defineEmits<{
  regenerate: []
  save: [content: string]
  'update:content': [value: string]
}>()

const renderedPreview = computed(() => renderMarkdown(props.content))

function saveAsNewResume() {
  if (!props.content) return
  emit('save', props.content)
}

function exportMd() {
  if (!props.content) return
  downloadMarkdown(props.content, `${props.companyName}-${props.jobTitle}-定制简历.md`)
}

function exportTxt() {
  if (!props.content) return
  downloadText(props.content, `${props.companyName}-${props.jobTitle}-定制简历.txt`)
}
</script>

<template>
  <div class="mt-6 space-y-4">
    <!-- 生成中 -->
    <div
      v-if="generating"
      class="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center justify-center"
    >
      <Loader2 class="w-12 h-12 text-accent animate-spin mb-4" />
      <p class="text-sm text-gray-600 font-medium">AI 正在为你定制简历...</p>
      <p class="text-xs text-gray-400 mt-1">这可能需要几秒钟，请耐心等待</p>
    </div>

    <!-- 生成失败 -->
    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 rounded-xl p-6">
      <div class="flex items-center gap-2 text-red-700 mb-2">
        <AlertCircle class="w-5 h-5" />
        <span class="font-medium">生成失败</span>
      </div>
      <p class="text-sm text-red-600 whitespace-pre-wrap break-words">{{ errorMsg }}</p>
      <button
        @click="emit('regenerate')"
        class="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
      >
        重试
      </button>
    </div>

    <!-- 生成成功 -->
    <div v-else-if="content">
      <!-- 保存成功提示 -->
      <div
        v-if="savedSuccess"
        class="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2"
      >
        <CheckCircle class="w-4 h-4 text-green-600" />
        <span class="text-sm text-green-700">已保存为新简历</span>
      </div>

      <!-- 结果操作按钮 -->
      <div class="flex flex-wrap items-center gap-2">
        <button
          @click="saveAsNewResume"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-dark transition-colors"
        >
          <Save class="w-4 h-4" />
          保存为新简历
        </button>
        <button
          @click="exportMd"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <FileDown class="w-4 h-4" />
          导出 Markdown
        </button>
        <button
          @click="exportTxt"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <FileDown class="w-4 h-4" />
          导出 TXT
        </button>
      </div>

      <!-- 左右分栏：编辑 + 预览 -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section class="bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <div class="flex items-center gap-2 text-sm font-medium text-gray-600">
              <FileText class="w-4 h-4" />
              原始 Markdown
            </div>
            <span class="text-xs text-gray-400">{{ content.length }} 字符</span>
          </div>
          <textarea
            :value="content"
            @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
            rows="20"
            class="w-full p-4 text-sm font-mono text-gray-800 resize-y focus:outline-none"
          ></textarea>
        </section>
        <section class="bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <div class="flex items-center gap-2 text-sm font-medium text-gray-600">
              <Eye class="w-4 h-4" />
              预览
            </div>
          </div>
          <div
            class="flex-1 overflow-auto p-4 prose prose-sm max-w-none"
            v-html="renderedPreview"
          ></div>
        </section>
      </div>
    </div>
  </div>
</template>
