import assert from 'node:assert/strict'
import test from 'node:test'
import { chunkResumeForRag, matchResumeWithKeywordRag } from '../src/utils/rag.ts'

test('兼容 Markdown 多级、粗体与纯文本章节标题', () => {
  const chunks = chunkResumeForRag(
    '# 张三\n\n### 教育背景\n某大学 本科\n\n**工作经历**\n某公司 前端工程师\n\n项目经验：\nAI 求职助手',
  )

  assert.equal(chunks[0]?.sectionTitle, '基本信息')
  assert.equal(chunks[0]?.type, 'other')
  assert.ok(chunks.some((chunk) => chunk.type === 'education'))
  assert.ok(chunks.some((chunk) => chunk.type === 'experience'))
  assert.ok(chunks.some((chunk) => chunk.type === 'project'))
})

test('项目经历优先归为项目，姓名标题不会误切章节', () => {
  const chunks = chunkResumeForRag('# 林世涛\n\n### 项目经历\nAI 求职助手')

  assert.equal(chunks.length, 2)
  assert.equal(chunks[0]?.type, 'other')
  assert.equal(chunks[1]?.type, 'project')
})

test('正文中的章节词不会被误识别成纯文本标题', () => {
  const chunks = chunkResumeForRag('张三\n\n我有丰富的项目经历并擅长跨团队协作。')

  assert.ok(chunks.every((chunk) => chunk.type === 'other'))
})

test('无标题简历使用高置信度内容分类兜底', () => {
  const chunks = chunkResumeForRag(
    '张三 13800000000\n\n某大学 计算机专业 本科 2020年毕业\n\n熟练 Vue React TypeScript 技术栈',
  )

  assert.ok(chunks.some((chunk) => chunk.type === 'education'))
  assert.ok(chunks.some((chunk) => chunk.type === 'skills'))
})

test('RAG 匹配为识别出的章节生成维度分数', () => {
  const result = matchResumeWithKeywordRag({
    resumeContent: [
      '# 林世涛',
      '### 专业技能',
      '熟练 Vue TypeScript React 前端开发',
      '### 项目经历',
      'AI 项目使用 Vue TypeScript 开发',
      '### 工作经历',
      '前端工程师负责 Vue 产品开发',
    ].join('\n\n'),
    companyName: '测试公司',
    jobTitle: '前端开发工程师',
    jobDescription: '需要 Vue TypeScript React 和 AI 项目经验',
    companyInfo: '',
  })

  assert.ok(result.dimensionScores.find((item) => item.dimension === '专业技能')!.score > 0)
  assert.ok(result.dimensionScores.find((item) => item.dimension === '项目经验')!.score > 0)
  assert.ok(result.dimensionScores.find((item) => item.dimension === '工作经历')!.score > 0)
})
