import type { StatusOption, ApplicationStatus } from '@/types'

// 投递状态选项
export const STATUS_OPTIONS: StatusOption[] = [
  { value: 'applied', label: '已投递', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'hr_read', label: 'HR已读', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { value: 'screen_pass', label: '初筛通过', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { value: 'technical', label: '技术面', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'hr', label: 'HR面', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'boss', label: 'Boss面', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'offer', label: '已Offer', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'rejected', label: '已挂', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'accepted', label: '已接', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
]

// 根据状态值获取选项
export function getStatusOption(status: ApplicationStatus): StatusOption {
  return STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0]
}

// 状态流转顺序
export const STATUS_FLOW: ApplicationStatus[] = [
  'applied',
  'hr_read',
  'screen_pass',
  'technical',
  'hr',
  'boss',
  'offer',
  'accepted',
]

// 格式化日期
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  return date.toLocaleDateString('zh-CN')
}
