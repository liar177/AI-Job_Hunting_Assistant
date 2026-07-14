import type {
  ApplicationStatus,
  ApplicationStatusDefinition,
  StatusColor,
  StatusOption,
} from '@/types'

export const STATUS_COLOR_OPTIONS: { value: StatusColor; label: string; swatch: string }[] = [
  { value: 'blue', label: '蓝色', swatch: 'bg-blue-500' },
  { value: 'purple', label: '紫色', swatch: 'bg-purple-500' },
  { value: 'cyan', label: '青色', swatch: 'bg-cyan-500' },
  { value: 'green', label: '绿色', swatch: 'bg-green-500' },
  { value: 'amber', label: '琥珀色', swatch: 'bg-amber-500' },
  { value: 'orange', label: '橙色', swatch: 'bg-orange-500' },
  { value: 'red', label: '红色', swatch: 'bg-red-500' },
  { value: 'gray', label: '灰色', swatch: 'bg-gray-500' },
]

export const STATUS_COLOR_CLASSES: Record<StatusColor, string> = {
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
}

const SYSTEM_STATUS_SEED_TIME = '2026-01-01T00:00:00.000Z'

export const DEFAULT_STATUS_DEFINITIONS: ApplicationStatusDefinition[] = [
  { id: 'applied', name: '已投递', description: '已完成岗位投递，等待后续反馈', color: 'blue', requiresInterviewSchedule: false, isSystem: true, sortOrder: 10, createdAt: SYSTEM_STATUS_SEED_TIME, updatedAt: SYSTEM_STATUS_SEED_TIME },
  { id: 'hr_read', name: 'HR已读', description: '招聘方已查看投递材料', color: 'cyan', requiresInterviewSchedule: false, isSystem: true, sortOrder: 20, createdAt: SYSTEM_STATUS_SEED_TIME, updatedAt: SYSTEM_STATUS_SEED_TIME },
  { id: 'screen_pass', name: '初筛通过', description: '简历筛选通过，等待下一步安排', color: 'cyan', requiresInterviewSchedule: false, isSystem: true, sortOrder: 30, createdAt: SYSTEM_STATUS_SEED_TIME, updatedAt: SYSTEM_STATUS_SEED_TIME },
  { id: 'technical', name: '技术面', description: '进入技术面试阶段', color: 'purple', requiresInterviewSchedule: true, isSystem: true, sortOrder: 40, createdAt: SYSTEM_STATUS_SEED_TIME, updatedAt: SYSTEM_STATUS_SEED_TIME },
  { id: 'hr', name: 'HR面', description: '进入 HR 面试阶段', color: 'purple', requiresInterviewSchedule: true, isSystem: true, sortOrder: 50, createdAt: SYSTEM_STATUS_SEED_TIME, updatedAt: SYSTEM_STATUS_SEED_TIME },
  { id: 'boss', name: 'Boss面', description: '进入负责人面试阶段', color: 'amber', requiresInterviewSchedule: true, isSystem: true, sortOrder: 60, createdAt: SYSTEM_STATUS_SEED_TIME, updatedAt: SYSTEM_STATUS_SEED_TIME },
  { id: 'offer', name: '已Offer', description: '已收到录用意向或正式 Offer', color: 'green', requiresInterviewSchedule: false, isSystem: true, sortOrder: 70, createdAt: SYSTEM_STATUS_SEED_TIME, updatedAt: SYSTEM_STATUS_SEED_TIME },
  { id: 'rejected', name: '已挂', description: '本次投递流程已结束', color: 'red', requiresInterviewSchedule: false, isSystem: true, sortOrder: 80, createdAt: SYSTEM_STATUS_SEED_TIME, updatedAt: SYSTEM_STATUS_SEED_TIME },
  { id: 'accepted', name: '已接', description: '已接受 Offer', color: 'green', requiresInterviewSchedule: false, isSystem: true, sortOrder: 90, createdAt: SYSTEM_STATUS_SEED_TIME, updatedAt: SYSTEM_STATUS_SEED_TIME },
]

let runtimeStatusDefinitions = [...DEFAULT_STATUS_DEFINITIONS]

export function setRuntimeStatusDefinitions(definitions: ApplicationStatusDefinition[]): void {
  runtimeStatusDefinitions = definitions.length ? [...definitions] : [...DEFAULT_STATUS_DEFINITIONS]
}

export function getRuntimeStatusDefinitions(): ApplicationStatusDefinition[] {
  return runtimeStatusDefinitions
}

export function getStatusDefinition(status: ApplicationStatus): ApplicationStatusDefinition | undefined {
  return runtimeStatusDefinitions.find((definition) => definition.id === status)
}

export function statusRequiresInterview(status: ApplicationStatus): boolean {
  return Boolean(getStatusDefinition(status)?.requiresInterviewSchedule)
}

// 保留默认选项导出，供尚未加载持久化状态时安全降级。
export const STATUS_OPTIONS: StatusOption[] = DEFAULT_STATUS_DEFINITIONS.map((definition) => ({
  value: definition.id,
  label: definition.name,
  color: STATUS_COLOR_CLASSES[definition.color],
  description: definition.description,
  requiresInterviewSchedule: definition.requiresInterviewSchedule,
}))

// 根据状态值获取选项
export function getStatusOption(status: ApplicationStatus): StatusOption {
  const definition = getStatusDefinition(status)
  if (!definition) {
    return { value: status, label: status, color: STATUS_COLOR_CLASSES.gray }
  }
  return {
    value: definition.id,
    label: definition.name,
    color: STATUS_COLOR_CLASSES[definition.color],
    description: definition.description,
    requiresInterviewSchedule: definition.requiresInterviewSchedule,
  }
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
