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

interface RagSection {
  type: string
  sectionTitle: string
  text: string
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

const SECTION_ALIASES: Record<string, string[]> = {
  experience: ['工作经历', '工作经验', '任职经历', '职业经历', '实习经历'],
  project: ['项目经历', '项目经验', '项目实践', '代表项目', '作品经历'],
  skills: ['专业技能', '技能清单', '技术能力', '技术栈', '核心技能'],
  summary: ['个人优势', '自我评价', '个人总结', '个人简介'],
  education: ['教育背景', '教育经历', '学历背景', '学校经历'],
  intent: ['求职意向', '期望职位', '职业目标'],
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
 * 识别 Markdown、粗体、书名号和纯文本章节标题。
 *
 * 纯文本标题必须与别名精确匹配；带有明确标题装饰时允许包含别名，
 * 从而兼容“### 工作经历 Experience”等写法，同时避免把正文中的
 * “我有丰富的项目经历”误判为章节边界。
 */
function parseSectionHeading(line: string): { title: string; type: string } | null {
  const trimmed = line.trim()
  if (!trimmed || /^[-+*]\s+/.test(trimmed) || /^\d+[.)、]\s*/.test(trimmed)) return null

  const markdownMatch = trimmed.match(/^#{1,6}\s+(.+?)\s*#*$/)
  const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*[:：]?$/)
    || trimmed.match(/^__(.+?)__\s*[:：]?$/)
  const bracketMatch = trimmed.match(/^【(.+?)】\s*[:：]?$/)
  const decorated = Boolean(markdownMatch || boldMatch || bracketMatch)
  const title = (markdownMatch?.[1] || boldMatch?.[1] || bracketMatch?.[1] || trimmed)
    .replace(/\s*[:：]\s*$/, '')
    .trim()

  if (!title || title.length > 32) return null
  const compactTitle = title.replace(/\s+/g, '')
  for (const [type, aliases] of Object.entries(SECTION_ALIASES)) {
    const matched = aliases.some((alias) => (
      decorated ? compactTitle.includes(alias) : compactTitle === alias
    ))
    if (matched) return { title, type }
  }
  return null
}

function countSignals(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + Number(pattern.test(text)), 0)
}

/**
 * 无章节标题时的高置信度兜底分类。
 *
 * 只有同时命中多个结构信号才归类，否则保留 other，避免为了产生分数
 * 而把普通正文强行归入某个维度。
 */
function inferContentChunkType(text: string): string {
  const projectSignals = countSignals(text, [
    /项目/,
    /技术栈|项目职责|项目描述|项目成果|项目亮点/,
    /负责|实现|搭建|开发/,
  ])
  if (projectSignals >= 2 && /项目/.test(text)) return 'project'

  const educationSignals = countSignals(text, [
    /大学|学院|学校/,
    /本科|硕士|博士|大专|学历/,
    /专业|毕业/,
    /(?:19|20)\d{2}[./年-]/,
  ])
  if (educationSignals >= 2) return 'education'

  const experienceSignals = countSignals(text, [
    /公司|集团|科技|事务所/,
    /工程师|经理|设计师|开发|任职/,
    /工作职责|岗位职责|任职时间/,
    /(?:19|20)\d{2}[./年-].{0,12}(?:19|20)\d{2}|至今/,
  ])
  if (experienceSignals >= 2) return 'experience'

  const technologyMatches = text.match(
    /\b(?:Vue|React|Angular|TypeScript|JavaScript|Node(?:\.js)?|Java|Python|Go|Rust|Git|Docker|SQL|CSS|HTML|Vite|Webpack)\b/gi,
  ) || []
  if (new Set(technologyMatches.map((item) => item.toLowerCase())).size >= 3
    && /熟练|精通|掌握|技能|技术栈|框架/.test(text)) {
    return 'skills'
  }

  if (/个人优势|自我评价|个人总结/.test(text) && /擅长|具备|经验|能力/.test(text)) {
    return 'summary'
  }
  return 'other'
}

function splitResumeSections(content: string): RagSection[] {
  const normalized = content.replace(/\r\n/g, '\n')
  const sections: RagSection[] = []
  let currentLines: string[] = []
  let currentTitle = '基本信息'
  let currentType = 'other'
  let recognizedHeadingCount = 0

  const pushCurrent = () => {
    const text = currentLines.join('\n').trim()
    if (text) sections.push({ type: currentType, sectionTitle: currentTitle, text })
  }

  for (const line of normalized.split('\n')) {
    const heading = parseSectionHeading(line)
    if (heading) {
      pushCurrent()
      currentLines = [line]
      currentTitle = heading.title
      currentType = heading.type
      recognizedHeadingCount += 1
    } else {
      currentLines.push(line)
    }
  }
  pushCurrent()

  if (recognizedHeadingCount > 0) return sections

  // 没有任何明确章节标题时，按自然段做保守分类。
  return normalized
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => {
      const type = inferContentChunkType(text)
      return {
        type,
        sectionTitle: type === 'other' ? (index === 0 ? '基本信息' : '其他') : DIMENSION_LABELS[type],
        text,
      }
    })
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
 * 切分策略：识别 1-6 级 Markdown 标题、粗体标题、书名号标题和独立成行的
 * 纯文本章节名；没有章节标题时再按自然段做高置信度兜底分类。
 *
 * 第一个无分类块默认为「基本信息」。
 * 每个块经过类型推断 + 长段拆分 + 分词后返回。
 */
export function chunkResumeForRag(content: string): RagChunk[] {
  const chunks: RagChunk[] = []
  splitResumeSections(content).forEach((section, sectionIndex) => {
    splitLongSection(section.text).forEach((text, partIndex) => {
      chunks.push({
        id: `${sectionIndex}-${partIndex}`,
        type: section.type,
        sectionTitle: section.sectionTitle,
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
 *   5. 全量候选用于各维度评分
 *   6. 仅截取全局 top-5 作为可视化证据
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
    .map((item) => `- ${item.dimension}: ${item.score > 0 ? `${item.score}%` : '暂无相关内容'}`)
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
