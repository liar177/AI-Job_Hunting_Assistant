import type {
  Application,
  ApplicationStatus,
  InterviewMode,
  InterviewSchedule,
  InterviewStage,
} from '@/types'
import { getStatusOption, statusRequiresInterview } from './constants'

export interface InterviewItem {
  application: Application
  stage: InterviewStage
  schedule: InterviewSchedule
}

export interface CalendarDay {
  date: Date
  key: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  interviews: InterviewItem[]
}

export const INTERVIEW_MODE_OPTIONS: { value: InterviewMode; label: string }[] = [
  { value: 'online', label: '线上' },
  { value: 'offline', label: '线下' },
]

export function isInterviewStage(status: ApplicationStatus): status is InterviewStage {
  return statusRequiresInterview(status)
}

export function getInterviewStageLabel(stage: InterviewStage): string {
  return getStatusOption(stage).label
}

export function getInterviewModeLabel(mode?: InterviewMode): string {
  if (mode === 'offline') return '线下'
  if (mode === 'online') return '线上'
  return '未设置'
}

export function getCurrentInterview(application: Application): InterviewSchedule | undefined {
  if (!isInterviewStage(application.status)) return undefined
  return application.interviews?.[application.status]
}

export function hasCompleteInterview(schedule?: InterviewSchedule): boolean {
  return Boolean(schedule?.interviewAt && schedule?.mode && schedule?.location?.trim())
}

export function needsInterviewInfo(application: Application): boolean {
  return isInterviewStage(application.status) && !hasCompleteInterview(getCurrentInterview(application))
}

export function collectInterviewItems(applications: Application[]): InterviewItem[] {
  return applications
    .flatMap((application) =>
      Object.entries(application.interviews || {}).flatMap(([stage, schedule]) => {
        if (!schedule?.interviewAt) return []
        return [{ application, stage, schedule }]
      })
    )
    .sort((a, b) => new Date(a.schedule.interviewAt).getTime() - new Date(b.schedule.interviewAt).getTime())
}

export function getUpcomingInterviewItems(applications: Application[], limit = Number.POSITIVE_INFINITY): InterviewItem[] {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const upcoming = collectInterviewItems(applications).filter(
    (item) => new Date(item.schedule.interviewAt).getTime() >= startOfToday
  )
  return upcoming.slice(0, limit)
}

export function formatInterviewDateTime(dateStr?: string): string {
  if (!dateStr) return '未设置时间'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '时间格式异常'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatInterviewDayLabel(dateStr?: string): string {
  if (!dateStr) return '待定'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '待定'

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((startOfDate - startOfToday) / 86400000)

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays === -1) return '昨天'
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' })
}

export function toDateTimeLocalValue(dateStr?: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function fromDateTimeLocalValue(value: string): string {
  return value ? new Date(value).toISOString() : ''
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function buildInterviewCalendarDays(monthDate: Date, interviews: InterviewItem[]): CalendarDay[] {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - firstDay.getDay())

  const todayKey = getDateKey(new Date())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = getDateKey(date)
    return {
      date,
      key,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isToday: key === todayKey,
      interviews: interviews.filter((item) => getDateKey(new Date(item.schedule.interviewAt)) === key),
    }
  })
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function buildInterviewIcs(application: Application, stage: InterviewStage, schedule: InterviewSchedule): string {
  const start = new Date(schedule.interviewAt)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const title = `${application.companyName} ${getInterviewStageLabel(stage)}`
  const description = [
    `职位：${application.jobTitle}`,
    schedule.interviewer ? `面试官：${schedule.interviewer}` : '',
    `形式：${getInterviewModeLabel(schedule.mode)}`,
    `地点/软件：${schedule.location}`,
  ].filter(Boolean).join('\\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AI Job Assistant//Interview Reminder//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${application.id}-${stage}@ai-job-assistant`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(schedule.location)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:面试将在 1 天后开始',
    'TRIGGER:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:面试将在 3 小时后开始',
    'TRIGGER:-PT3H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return `${lines.join('\r\n')}\r\n`
}

export function downloadInterviewIcs(application: Application, stage: InterviewStage, schedule: InterviewSchedule): void {
  const content = buildInterviewIcs(application, stage, schedule)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${application.companyName}-${getInterviewStageLabel(stage)}-面试提醒.ics`
  link.click()
  URL.revokeObjectURL(url)
}
