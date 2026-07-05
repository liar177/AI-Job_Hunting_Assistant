import type { AnalyzeRequest, RagChunkMatch, RagDimensionScore, RagMatchResult } from '@/types'

interface RagChunk {
  id: string
  type: string
  sectionTitle: string
  text: string
  tokens: string[]
}

const DIMENSION_WEIGHTS: Record<string, number> = {
  experience: 0.3,
  project: 0.25,
  skills: 0.25,
  summary: 0.15,
  education: 0.05,
}

const DIMENSION_LABELS: Record<string, string> = {
  experience: '工作经历',
  project: '项目经验',
  skills: '专业技能',
  summary: '个人优势',
  education: '教育背景',
  intent: '求职意向',
  other: '其他',
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text)
  const matches = normalized.match(/[a-z0-9+#.\-]+|[\u4e00-\u9fa5]+/g) || []
  const tokens: string[] = []

  for (const item of matches) {
    if (/^[\u4e00-\u9fa5]+$/.test(item)) {
      if (item.length <= 2) {
        tokens.push(item)
      } else {
        tokens.push(item)
        for (let index = 0; index < item.length - 1; index += 1) {
          tokens.push(item.slice(index, index + 2))
        }
      }
    } else {
      tokens.push(item)
    }
  }

  return tokens.filter((token) => token.length > 1)
}

function inferChunkType(title: string): string {
  if (/项目|作品/.test(title)) return 'project'
  if (/工作|经历|任职/.test(title)) return 'experience'
  if (/技能|技术|专业/.test(title)) return 'skills'
  if (/优势|总结|简介|自我/.test(title)) return 'summary'
  if (/教育|学历|学校/.test(title)) return 'education'
  if (/求职|意向/.test(title)) return 'intent'
  return 'other'
}

function splitLongSection(section: string): string[] {
  if (section.length <= 1200) return [section]
  const parts = section
    .split(/\n{2,}|(?=\n-\s)|(?=\n\*\*)/)
    .map((part) => part.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  for (const part of parts) {
    if (current && current.length + part.length > 1200) {
      chunks.push(current.trim())
      current = part
    } else {
      current = current ? `${current}\n\n${part}` : part
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks.length ? chunks : [section]
}

export function chunkResumeForRag(content: string): RagChunk[] {
  const normalized = content.replace(/\r\n/g, '\n')
  const blocks = normalized.split(/(?=^##\s+)/m)
  const chunks: RagChunk[] = []

  blocks.forEach((block, blockIndex) => {
    const trimmed = block.trim()
    if (!trimmed) return

    const titleMatch = trimmed.match(/^##\s+(.+)$/m)
    const sectionTitle = titleMatch?.[1]?.replace(/[-#]/g, '').trim() || (blockIndex === 0 ? '基本信息' : '其他')
    const type = inferChunkType(sectionTitle)

    splitLongSection(trimmed).forEach((text, partIndex) => {
      chunks.push({
        id: `${blockIndex}-${partIndex}`,
        type,
        sectionTitle,
        text,
        tokens: tokenize(text),
      })
    })
  })

  return chunks
}

function countTerms(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1)
  }
  return counts
}

function bm25Score(queryTokens: string[], chunk: RagChunk, chunks: RagChunk[]): number {
  if (!queryTokens.length || !chunk.tokens.length) return 0

  const k1 = 1.5
  const b = 0.75
  const avgDocLength = chunks.reduce((sum, item) => sum + item.tokens.length, 0) / Math.max(chunks.length, 1)
  const docCounts = countTerms(chunk.tokens)
  const uniqueQueryTokens = Array.from(new Set(queryTokens))

  return uniqueQueryTokens.reduce((score, term) => {
    const termFrequency = docCounts.get(term) || 0
    if (!termFrequency) return score

    const docsWithTerm = chunks.filter((item) => item.tokens.includes(term)).length
    const idf = Math.log(1 + (chunks.length - docsWithTerm + 0.5) / (docsWithTerm + 0.5))
    const denominator = termFrequency + k1 * (1 - b + b * (chunk.tokens.length / avgDocLength))
    return score + idf * ((termFrequency * (k1 + 1)) / denominator)
  }, 0)
}

function normalizeScore(score: number): number {
  return Math.round(Math.min(100, Math.max(0, (score / (score + 4)) * 100)))
}

function buildDimensionScores(matches: RagChunkMatch[]): RagDimensionScore[] {
  return Object.entries(DIMENSION_WEIGHTS).map(([type, weight]) => {
    const topMatches = matches
      .filter((match) => match.chunkType === type)
      .slice(0, 2)
    const score = topMatches.length
      ? Math.round(topMatches.reduce((sum, match) => sum + match.score, 0) / topMatches.length)
      : 0

    return {
      dimension: DIMENSION_LABELS[type],
      score,
      weight,
    }
  })
}

function weightedOverallScore(scores: RagDimensionScore[]): number {
  const weighted = scores.reduce((sum, item) => sum + item.score * item.weight, 0)
  const totalWeight = scores.reduce((sum, item) => sum + item.weight, 0)
  return Math.round(weighted / Math.max(totalWeight, 1))
}

export function matchResumeWithKeywordRag(request: AnalyzeRequest): RagMatchResult {
  const chunks = chunkResumeForRag(request.resumeContent)
  const query = [
    request.companyName,
    request.jobTitle,
    request.jobDescription,
    request.companyInfo,
  ].join('\n')
  const queryTokens = tokenize(query)

  const matches = chunks
    .map((chunk) => ({
      chunk,
      rawScore: bm25Score(queryTokens, chunk, chunks),
    }))
    .filter((item) => item.rawScore > 0)
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, 8)
    .map<RagChunkMatch>(({ chunk, rawScore }) => ({
      chunkId: chunk.id,
      chunkType: chunk.type,
      sectionTitle: chunk.sectionTitle,
      text: chunk.text,
      score: normalizeScore(rawScore),
    }))

  const dimensionScores = buildDimensionScores(matches)
  return {
    retrievalMode: 'keyword',
    overallScore: weightedOverallScore(dimensionScores),
    dimensionScores,
    topChunks: matches.slice(0, 5),
    warning: '语义向量未启用，当前使用本地关键词匹配。',
  }
}

export function formatRagContext(rag?: RagMatchResult): string {
  if (!rag) return '未提供 RAG 匹配证据。'

  const dimensions = rag.dimensionScores
    .map((item) => `- ${item.dimension}: ${item.score}%`)
    .join('\n')
  const chunks = rag.topChunks
    .map((chunk, index) => `${index + 1}. [${chunk.sectionTitle}] 匹配度 ${chunk.score}%\n${chunk.text}`)
    .join('\n\n')

  return [
    `检索方式：${rag.retrievalMode === 'embedding' ? '语义向量' : '关键词 BM25'}`,
    `本地计算匹配度：${rag.overallScore}%`,
    rag.warning ? `提示：${rag.warning}` : '',
    '',
    '### 维度分数',
    dimensions || '暂无维度分数',
    '',
    '### 最相关简历片段',
    chunks || '暂无相关片段',
  ].filter(Boolean).join('\n')
}
