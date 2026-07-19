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

// 投递状态 ID。系统状态沿用既有 ID，自定义状态使用生成的稳定 ID。
export type ApplicationStatus = string

export type StatusColor =
  | 'blue'
  | 'purple'
  | 'cyan'
  | 'green'
  | 'amber'
  | 'orange'
  | 'red'
  | 'gray'

export interface ApplicationStatusDefinition {
  id: ApplicationStatus
  name: string
  description: string
  color: StatusColor
  requiresInterviewSchedule: boolean
  isSystem: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ApplicationStatusInput {
  name: string
  description: string
  color: StatusColor
  requiresInterviewSchedule: boolean
}

export type InterviewStage = ApplicationStatus

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

export type InterviewSchedules = Partial<Record<string, InterviewSchedule>>

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
  status?: ApplicationStatus
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

// 自我介绍生成请求类型。该流程独立于简历生成，优化依据仅作为可选上下文。
export interface SelfIntroductionRequest extends AnalyzeRequest {
  optimizationBasis?: OptimizationBasis
  direction?: string
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
  description?: string
  requiresInterviewSchedule?: boolean
}
