// 简历数据类型
export interface Resume {
  id: string
  title: string
  content: string
  originalContent: string
  sourceType?: string
  version: number
  createdAt: string
  updatedAt: string
}

// 简历创建输入类型
export interface ResumeInput {
  title: string
  content: string
  originalContent: string
  sourceType?: string
}

// 投递状态类型
export type ApplicationStatus =
  | 'applied'      // 已投递
  | 'hr_read'      // HR已读
  | 'screen_pass'  // 初筛通过
  | 'technical'    // 技术面
  | 'hr'           // HR面
  | 'boss'         // Boss面
  | 'offer'        // 已Offer
  | 'rejected'     // 已挂
  | 'accepted'     // 已接

export type InterviewStage = Extract<ApplicationStatus, 'technical' | 'hr' | 'boss'>

export type InterviewMode = 'online' | 'offline'

export type CalendarReminderStatus = 'none' | 'created' | 'failed'

export interface InterviewSchedule {
  interviewAt: string
  mode: InterviewMode
  location: string
  interviewer?: string
  calendarReminderStatus?: CalendarReminderStatus
  updatedAt: string
}

export type InterviewSchedules = Partial<Record<InterviewStage, InterviewSchedule>>

// 投递记录类型
export interface Application {
  id: string
  companyName: string
  jobTitle: string
  jobDescription: string
  companyInfo: string
  resumeId: string
  status: ApplicationStatus
  interviews?: InterviewSchedules
  notes: string
  appliedAt: string
  updatedAt: string
}

// 投递记录创建输入类型
export interface ApplicationInput {
  companyName: string
  jobTitle: string
  jobDescription: string
  companyInfo: string
  resumeId: string
  notes?: string
}

// AI配置类型
export interface AIConfig {
  id: string
  provider: 'deepseek' | 'aliyun-bailian' | 'custom'
  apiKey: string
  model: string
  baseUrl: string
  ragMode: 'auto' | 'embedding' | 'keyword'
  embeddingProvider: 'aliyun-bailian' | 'openai-compatible' | 'custom'
  embeddingApiKey: string
  embeddingModel: string
  embeddingEndpoint: string
  embeddingDimension?: number
}

export interface RagDimensionScore {
  dimension: string
  score: number
  weight: number
}

export interface RagChunkMatch {
  chunkId: string
  chunkType: string
  sectionTitle: string
  text: string
  score: number
}

export interface RagMatchResult {
  overallScore: number
  retrievalMode: 'embedding' | 'keyword'
  dimensionScores: RagDimensionScore[]
  topChunks: RagChunkMatch[]
  warning?: string
}

// AI分析请求类型
export interface AnalyzeRequest {
  resumeId?: string
  resumeContent: string
  companyName: string
  jobTitle: string
  jobDescription: string
  companyInfo: string
  rag?: RagMatchResult
}

// 简历优化依据类型
export interface OptimizationBasis {
  fitSummary: string
  fitScore: number
  matchedAdvantages: string[]
  weakPoints: string[]
  transferableExperience: string[]
  keywordStrategy: string[]
  rewriteStrategy: string[]
  riskNotes: string[]
  rag?: RagMatchResult
}

// AI分析响应类型
export interface AnalyzeResponse {
  success: boolean
  data?: OptimizationBasis
  rawContent?: string
  error?: string
}

// AI生成请求类型
export interface GenerateRequest extends AnalyzeRequest {
  optimizationBasis?: OptimizationBasis
}

// AI生成响应类型
export interface GenerateResponse {
  success: boolean
  content: string
  error?: string
}

// 状态选项类型
export interface StatusOption {
  value: ApplicationStatus
  label: string
  color: string
}
