import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_SELF_INTRODUCTION_DIRECTION,
  cleanSelfIntroductionContent,
  estimateSelfIntroductionSeconds,
  formatSelfIntroductionDirection,
  formatSelfIntroductionDuration,
} from '../src/utils/self-introduction.ts'

test('空优化方向会明确注入默认方向', () => {
  assert.equal(
    formatSelfIntroductionDirection('   '),
    `默认方向：${DEFAULT_SELF_INTRODUCTION_DIRECTION}`,
  )
})

test('用户填写的优化方向优先于默认方向', () => {
  assert.equal(
    formatSelfIntroductionDirection('重点突出跨团队协作'),
    '用户自定义方向：重点突出跨团队协作',
  )
})

test('清理模型可能返回的代码围栏与标题', () => {
  assert.equal(
    cleanSelfIntroductionContent('```markdown\n## 自我介绍\n您好，我是张明。\n```'),
    '您好，我是张明。',
  )
})

test('预计时长按每秒 3.5 个非空白字符计算', () => {
  assert.equal(estimateSelfIntroductionSeconds('1234567'), 2)
  assert.equal(estimateSelfIntroductionSeconds(''), 0)
})

test('预计时长可读格式覆盖分钟与秒数', () => {
  assert.equal(formatSelfIntroductionDuration(''), '预计 0 秒')
  assert.equal(formatSelfIntroductionDuration('a'.repeat(210)), '预计 1 分钟')
  assert.equal(formatSelfIntroductionDuration('a'.repeat(217)), '预计 1 分 2 秒')
})
