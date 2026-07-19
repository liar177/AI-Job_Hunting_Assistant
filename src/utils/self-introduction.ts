export const DEFAULT_SELF_INTRODUCTION_DIRECTION =
  '简单带过其他内容，重点简要说明与岗位高度匹配且有深度的工作或项目经历。'

export function formatSelfIntroductionDirection(direction?: string): string {
  const customDirection = direction?.trim()
  return customDirection
    ? `用户自定义方向：${customDirection}`
    : `默认方向：${DEFAULT_SELF_INTRODUCTION_DIRECTION}`
}

export function cleanSelfIntroductionContent(content: string): string {
  return content
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/^#{1,3}\s*自我介绍\s*/i, '')
    .trim()
}

export function estimateSelfIntroductionSeconds(content: string): number {
  const readableCharacters = content.replace(/\s+/g, '').length
  return readableCharacters ? Math.max(1, Math.ceil(readableCharacters / 3.5)) : 0
}

export function formatSelfIntroductionDuration(content: string): string {
  const seconds = estimateSelfIntroductionSeconds(content)
  if (!seconds) return '预计 0 秒'
  if (seconds < 60) return `预计 ${seconds} 秒`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds
    ? `预计 ${minutes} 分 ${remainingSeconds} 秒`
    : `预计 ${minutes} 分钟`
}
