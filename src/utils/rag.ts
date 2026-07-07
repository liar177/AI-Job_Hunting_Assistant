// 浏览器端 RAG 实现 —— 纯 TypeScript BM25 关键词检索
//
// 这是 RAG 系统的「浏览器分支」。桌面端对应实现见 src-tauri/src/rag/mod.rs。
// 两者的分块策略、BM25 公式、维度权重完全同构，保证跨平台行为一致。
//
// 核心流程：
//   chunkResumeForRag()  分块 + 分词（离线/实时）
//        ↓
//   matchResumeWithKeywordRag()  BM25 检索（在线）
//        ↓
//   formatRagContext()  格式化为 Prompt 可注入的 Markdown 文本
//
// 与桌面端的关键差异：
//   - 不调用 embedding API（浏览器端没有安全的 API Key 存储）
//   - 不做持久化索引（每次检索时实时切分+分词）
//   - 仅支持 BM25，不支持语义向量搜索

import type { AnalyzeRequest, RagChunkMatch, RagDimensionScore, RagMatchResult } from '@/types'

/** 浏览器端 RAG 分块（仅用于内存中检索，不持久化） */
interface RagChunk {
  id: string
  type: string
  sectionTitle: string
  text: string
  tokens: string[]
}

/**
 * 维度权重配置
 *
 * 经验占比最高（30%），因为 JD 匹配中最重要的是过往工作经历。
 * 教育占比最低（5%），因为实际招聘中教育背景的区分度有限。
 * 这些权重同时用于 BM25 的维度打分和最终总分计算。
 */
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

/**
 * CJK 感知分词器
 *
 * 核心挑战：中文没有天然的空格分词边界，不像英文。
 * 解决方案：bigram 子词切分 —— 不做真正的语义分词（不依赖 jieba 等库），
 * 而是暴力生成所有相邻二字组合，同时保留原词。
 *
 * 例如 "前端工程师" → ["前端工程师", "前端", "端工", "工程", "程师"]
 *
 * 为什么是 bigram 而不是 trigram？
 *   二字词在中文中最常见，bigram 能覆盖大多数有意义的子串。
 *   保留原词是因为 BM25 的 IDF 会天然给长词更高权重（更稀有）。
 *
 * 英文/数字：按词边界直接切分，不需要 bigram。
 * 最后过滤掉单字 token，减少噪音。
 */
function tokenize(text: string): string[] {
  const normalized = normalizeText(text)
  const matches = normalized.match(/[a-z0-9+#.\-]+|[一-龥]+/g) || []
  const tokens: string[] = []

  for (const item of matches) {
    if (/^[一-龥]+$/.test(item)) {
      // 中文块：保留完整词 + 生成所有相邻二字对
      if (item.length <= 2) {
        tokens.push(item)
      } else {
        tokens.push(item) // 原词保留
        for (let index = 0; index < item.length - 1; index += 1) {
          tokens.push(item.slice(index, index + 2)) // bigram
        }
      }
    } else {
      tokens.push(item) // 英文/数字直接使用
    }
  }

  return tokens.filter((token) => token.length > 1)
}

/**
 * 根据标题文本推断分块类型
 *
 * 用关键词匹配而非 AI 分类，保证确定性 —— 同样的标题永远得到同样的类型。
 * 类型决定了后续维度打分时的权重归属。
 */
function inferChunkType(title: string): string {
  if (/项目|作品/.test(title)) return 'project'
  if (/工作|经历|任职/.test(title)) return 'experience'
  if (/技能|技术|专业/.test(title)) return 'skills'
  if (/优势|总结|简介|自我/.test(title)) return 'summary'
  if (/教育|学历|学校/.test(title)) return 'education'
  if (/求职|意向/.test(title)) return 'intent'
  return 'other'
}

/**
 * 长段落二次拆分
 *
 * 1200 字符是经验阈值 —— 超过这个长度的段落可能混合了多个语义单元，
 * 按空行和列表边界二次拆分，让每个 chunk 信息密度更集中。
 * 拆分边界：双空行、列表项开头（"- " 或 "**"）
 */
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

/**
 * 简历分块函数 —— RAG pipeline 的第一步
 *
 * 切分策略：以 ## 标题为边界切分，因为 Markdown 简历的 ## 标题
 * 天然代表了语义边界（工作经历 / 项目经验 / 专业技能 等）。
 *
 * 第一个块如果没有 ## 标题，默认为「基本信息」。
 * 每个块经过类型推断 + 长段拆分 + 分词后返回。
 */
export function chunkResumeForRag(content: string): RagChunk[] {
  const normalized = content.replace(/\r\n/g, '\n')
  const blocks = normalized.split(/(?=^##\s+)/m) // 前瞻断言：在 ## 之前切开，保留分隔符
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
        tokens: tokenize(text), // 预分词，避免检索时重复计算
      })
    })
  })

  return chunks
}

// ===== BM25 算法实现 =====

function countTerms(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1)
  }
  return counts
}

/**
 * BM25 评分函数
 *
 * BM25 是 TF-IDF 的改进版，解决两个核心问题：
 *   1. 词频饱和：一个词出现 100 次不应比出现 10 次相关 100 倍（k1 控制）
 *   2. 长度归一化：长文档天然更容易命中，需消除偏差（b 控制）
 *
 * 公式：BM25 = Σ IDF(qi) × TF_saturated(qi, D)
 *   IDF = ln(1 + (N - df + 0.5) / (df + 0.5))
 *   TF_saturated = (tf × (k1 + 1)) / (tf + k1 × (1 - b + b × docLen / avgLen))
 *
 * @param queryTokens  查询的 token 列表（JD + 公司 + 职位 拼接后分词）
 * @param chunk        当前要打分的简历分块
 * @param chunks       所有分块（用于计算 IDF 和平均长度）
 * @returns            BM25 原始分数（无界，需要后续归一化）
 */
function bm25Score(queryTokens: string[], chunk: RagChunk, chunks: RagChunk[]): number {
  if (!queryTokens.length || !chunk.tokens.length) return 0

  const k1 = 1.5 // 词频饱和参数：越大越接近线性增长
  const b = 0.75 // 长度归一化强度：越大对长文档惩罚越重
  const avgDocLength = chunks.reduce((sum, item) => sum + item.tokens.length, 0) / Math.max(chunks.length, 1)
  const docCounts = countTerms(chunk.tokens)
  const uniqueQueryTokens = Array.from(new Set(queryTokens)) // 查询中去重，避免同一词重复加分

  return uniqueQueryTokens.reduce((score, term) => {
    const termFrequency = docCounts.get(term) || 0
    if (!termFrequency) return score // 词不在文档中，贡献 0

    // IDF: 越稀有的词权重越高
    const docsWithTerm = chunks.filter((item) => item.tokens.includes(term)).length
    const idf = Math.log(1 + (chunks.length - docsWithTerm + 0.5) / (docsWithTerm + 0.5))

    // TF 部分：饱和函数 + 长度归一化
    const denominator = termFrequency + k1 * (1 - b + b * (chunk.tokens.length / avgDocLength))
    return score + idf * ((termFrequency * (k1 + 1)) / denominator)
  }, 0)
}

/**
 * BM25 分数归一化
 *
 * 使用饱和函数 score/(score+4)*100 把无界的 BM25 原始分数映射到 [0, 100]。
 * 4 是经验常数：原始分数=4 时归一化为 50 分，表示"中等匹配"。
 */
function normalizeScore(score: number): number {
  return Math.round(Math.min(100, Math.max(0, (score / (score + 4)) * 100)))
}

/**
 * 构建维度分数
 *
 * 对每个维度，取该类型 top-2 匹配块的平均分。
 * 如果没有匹配到该维度的任何块，该维度分数为 0。
 */
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

/**
 * 维度加权总分
 *
 * 不是简单地对 top chunks 的分数取平均，而是按维度权重加权。
 * 这样即使某个维度（如教育）完全没匹配，也不会过度拉低总分。
 */
function weightedOverallScore(scores: RagDimensionScore[]): number {
  const weighted = scores.reduce((sum, item) => sum + item.score * item.weight, 0)
  const totalWeight = scores.reduce((sum, item) => sum + item.weight, 0)
  return Math.round(weighted / Math.max(totalWeight, 1))
}

/**
 * 浏览器端 RAG 检索入口
 *
 * 完整流程：
 *   1. 分块简历（实时）
 *   2. 将公司名/职位/JD/公司信息拼接为查询字符串
 *   3. 对查询分词
 *   4. 计算每个 chunk 的 BM25 分数
 *   5. 取 top-8 → 归一化 → top-5 返回
 *   6. 计算维度分数和加权总分
 *
 * 始终返回 retrievalMode: 'keyword' + 提示信息，
 * 因为浏览器端不支持语义向量搜索。
 */
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

/**
 * 格式化 RAG 检索结果为 Prompt 可注入的 Markdown 文本
 *
 * 输出的结构：
 *   检索方式：语义向量 / 关键词 BM25
 *   本地计算匹配度：XX%
 *   ### 维度分数
 *   ### 最相关简历片段
 *
 * 这个文本会被注入到 RESUME_ANALYSIS_PROMPT 和 RESUME_GENERATION_PROMPT 的
 * {ragContext} 占位符中，帮助 LLM 理解哪些简历片段与目标岗位最相关。
 */
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
