// 简历数据类型
export interface Resume {
  id: string
  title: string
  content: string
  originalContent: string
  version: number
  createdAt: string
  updatedAt: string
}

// 简历创建输入类型
export interface ResumeInput {
  title: string
  content: string
  originalContent: string
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

// 投递记录类型
export interface Application {
  id: string
  companyName: string
  jobTitle: string
  jobDescription: string
  companyInfo: string
  resumeId: string
  status: ApplicationStatus
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
  provider: 'deepseek' | 'custom'
  apiKey: string
  model: string
  baseUrl: string
}

// AI生成请求类型
export interface GenerateRequest {
  resumeContent: string
  jobDescription: string
  companyInfo: string
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
