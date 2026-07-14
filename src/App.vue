<script setup lang="ts">
import AppLayout from '@/components/Layout/AppLayout.vue'
import { onMounted, onUnmounted } from 'vue'
import { useApplicationStatusStore } from '@/stores/application-status'
import { invoke } from '@tauri-apps/api/core'
import {
  sendNotification,
  requestPermission,
  isPermissionGranted,
} from '@tauri-apps/plugin-notification'

interface ReminderEvent {
  applicationId: string
  companyName: string
  jobTitle: string
  stageLabel: string
  interviewAt: string
  modeLabel: string
  location: string
  interviewer: string
  when: string
}

let timer: ReturnType<typeof setInterval> | undefined
const notifiedIds = new Set<string>()
const statusStore = useApplicationStatusStore()

function showReminderNotification(event: ReminderEvent) {
  const id = `${event.applicationId}-${event.when}`
  if (notifiedIds.has(id)) return
  notifiedIds.add(id)

  let body = `${event.companyName} · ${event.stageLabel}将在 ${event.when} 后开始`
  if (event.modeLabel) body += `\n形式：${event.modeLabel}`
  if (event.location) body += `\n地点：${event.location}`
  if (event.interviewer) body += `\n面试官：${event.interviewer}`

  sendNotification({
    title: `面试提醒 - ${event.companyName}`,
    body,
  })
}

async function initAndCheck() {
  // 确保通知权限（macOS 需要，Windows 无害）
  try {
    if (!(await isPermissionGranted())) {
      await requestPermission()
    }
  } catch { /* 权限不影响主流程 */ }

  // 检查提醒
  try {
    const events = await invoke<ReminderEvent[]>('check_interview_reminders')
    if (Array.isArray(events)) {
      events.forEach(showReminderNotification)
    }
  } catch { /* 静默处理 */ }
}

onMounted(async () => {
  await statusStore.loadStatuses()
  initAndCheck()
  timer = setInterval(async () => {
    try {
      const events = await invoke<ReminderEvent[]>('check_interview_reminders')
      if (Array.isArray(events)) {
        events.forEach(showReminderNotification)
      }
    } catch { /* 静默处理 */ }
  }, 30_000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <AppLayout />
</template>
