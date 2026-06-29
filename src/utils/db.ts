import type { Resume, Application, AIConfig } from '@/types'

// 本地存储键名
export const STORAGE_KEYS = {
  RESUMES: 'job_assistant_resumes',
  APPLICATIONS: 'job_assistant_applications',
  AI_CONFIG: 'job_assistant_ai_config',
} as const

// 生成唯一ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

// 获取当前时间ISO字符串
export function now(): string {
  return new Date().toISOString()
}

// 通用本地存储读写
function readData<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function writeData<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
}

// ===== 简历相关操作 =====
export const resumeDb = {
  getAll(): Resume[] {
    return readData<Resume>(STORAGE_KEYS.RESUMES).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  },

  getById(id: string): Resume | undefined {
    return readData<Resume>(STORAGE_KEYS.RESUMES).find((r) => r.id === id)
  },

  create(data: { title: string; content: string; originalContent: string }): Resume {
    const resumes = readData<Resume>(STORAGE_KEYS.RESUMES)
    const resume: Resume = {
      id: generateId(),
      title: data.title,
      content: data.content,
      originalContent: data.originalContent,
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    }
    resumes.push(resume)
    writeData(STORAGE_KEYS.RESUMES, resumes)
    return resume
  },

  update(id: string, data: Partial<Pick<Resume, 'title' | 'content'>>): Resume | undefined {
    const resumes = readData<Resume>(STORAGE_KEYS.RESUMES)
    const index = resumes.findIndex((r) => r.id === id)
    if (index === -1) return undefined
    resumes[index] = {
      ...resumes[index],
      ...data,
      version: resumes[index].version + 1,
      updatedAt: now(),
    }
    writeData(STORAGE_KEYS.RESUMES, resumes)
    return resumes[index]
  },

  delete(id: string): void {
    const resumes = readData<Resume>(STORAGE_KEYS.RESUMES)
    writeData(
      STORAGE_KEYS.RESUMES,
      resumes.filter((r) => r.id !== id)
    )
  },
}

// ===== 投递记录相关操作 =====
export const applicationDb = {
  getAll(): Application[] {
    return readData<Application>(STORAGE_KEYS.APPLICATIONS).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  },

  getById(id: string): Application | undefined {
    return readData<Application>(STORAGE_KEYS.APPLICATIONS).find((a) => a.id === id)
  },

  create(data: {
    companyName: string
    jobTitle: string
    jobDescription: string
    companyInfo: string
    resumeId: string
    notes?: string
  }): Application {
    const applications = readData<Application>(STORAGE_KEYS.APPLICATIONS)
    const application: Application = {
      id: generateId(),
      companyName: data.companyName,
      jobTitle: data.jobTitle,
      jobDescription: data.jobDescription,
      companyInfo: data.companyInfo,
      resumeId: data.resumeId,
      status: 'applied',
      notes: data.notes || '',
      appliedAt: now(),
      updatedAt: now(),
    }
    applications.push(application)
    writeData(STORAGE_KEYS.APPLICATIONS, applications)
    return application
  },

  update(id: string, data: Partial<Application>): Application | undefined {
    const applications = readData<Application>(STORAGE_KEYS.APPLICATIONS)
    const index = applications.findIndex((a) => a.id === id)
    if (index === -1) return undefined
    applications[index] = {
      ...applications[index],
      ...data,
      updatedAt: now(),
    }
    writeData(STORAGE_KEYS.APPLICATIONS, applications)
    return applications[index]
  },

  delete(id: string): void {
    const applications = readData<Application>(STORAGE_KEYS.APPLICATIONS)
    writeData(
      STORAGE_KEYS.APPLICATIONS,
      applications.filter((a) => a.id !== id)
    )
  },
}

// ===== AI配置相关操作 =====
export const aiConfigDb = {
  get(): AIConfig {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AI_CONFIG)
      if (data) return JSON.parse(data)
    } catch {
      // 解析失败时返回默认配置
    }
    return {
      id: 'default',
      provider: 'deepseek',
      apiKey: '',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
    }
  },

  save(config: Partial<AIConfig>): AIConfig {
    const current = aiConfigDb.get()
    const updated = { ...current, ...config }
    localStorage.setItem(STORAGE_KEYS.AI_CONFIG, JSON.stringify(updated))
    return updated
  },
}
