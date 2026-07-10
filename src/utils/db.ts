// 浏览器端 localStorage CRUD 实现
//
// 这是平台适配的「浏览器分支」—— 当 isTauri() 为 false 时使用。
// 桌面端对应的实现在 src-tauri/src/db.rs（SQLite）。
//
// 两者通过 db-adapter.ts 统一为相同的 async 接口，
// 调用方（Store 层）不需要关心底层是 localStorage 还是 SQLite。
//
// 局限性：
// - localStorage 有 5-10MB 容量限制，不适合大量简历
// - 数据仅存在于当前浏览器，清除缓存会导致数据丢失
// - 没有索引能力，查询靠 JS 数组 filter/find
//
// 因此浏览器模式仅用于开发调试，生产环境应使用桌面端。

import type { Resume, Application, AIConfig } from '@/types'

/** localStorage 键名常量，统一管理避免散落字符串 */
export const STORAGE_KEYS = {
  RESUMES: 'job_assistant_resumes',
  APPLICATIONS: 'job_assistant_applications',
  AI_CONFIG: 'job_assistant_ai_config',
} as const

/**
 * 默认 AI 配置
 *
 * Chat 模型默认使用 DeepSeek（兼容 OpenAI API 格式），
 * Embedding 默认使用阿里云百炼 text-embedding-v4。
 * RAG 模式默认 'auto'：优先语义向量，失败自动降级 BM25。
 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  id: 'default',
  provider: 'deepseek',
  apiKey: '',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com/v1',
  ragMode: 'auto',
  embeddingProvider: 'aliyun-bailian',
  embeddingApiKey: '',
  embeddingModel: 'text-embedding-v4',
  embeddingEndpoint: 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
}

/**
 * 生成唯一 ID
 *
 * 浏览器端无法使用 UUID v4（需要 crypto.randomUUID 或额外依赖），
 * 使用时间戳（36进制压缩）+ 随机字符串拼接，碰撞概率极低，
 * 对于单用户本地应用完全足够。
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

/** 获取当前 UTC 时间 ISO 字符串 */
export function now(): string {
  return new Date().toISOString()
}

// ===== 通用 localStorage 读写 =====

function readData<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : []
  } catch {
    return [] // 数据损坏时返回空数组，静默降级
  }
}

function writeData<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
}

// ===== 简历 CRUD =====

export const resumeDb = {
  /** 按更新时间倒序获取所有简历 */
  getAll(): Resume[] {
    return readData<Resume>(STORAGE_KEYS.RESUMES).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  },

  getById(id: string): Resume | undefined {
    return readData<Resume>(STORAGE_KEYS.RESUMES).find((r) => r.id === id)
  },

  /** 创建简历，自动生成 ID、时间戳和版本号 */
  create(data: { title: string; content: string; originalContent: string; sourceType?: string }): Resume {
    const resumes = readData<Resume>(STORAGE_KEYS.RESUMES)
    const resume = {
      id: generateId(),
      title: data.title,
      content: data.content,
      originalContent: data.originalContent,
      sourceType: data.sourceType,
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    } as Resume & { sourceType?: string }
    resumes.push(resume)
    writeData(STORAGE_KEYS.RESUMES, resumes)
    return resume
  },

  /** 更新简历时自动递增版本号，用于 RAG 索引增量判断 */
  update(id: string, data: Partial<Pick<Resume, 'title' | 'content'>>): Resume | undefined {
    const resumes = readData<Resume>(STORAGE_KEYS.RESUMES)
    const index = resumes.findIndex((r) => r.id === id)
    if (index === -1) return undefined
    resumes[index] = {
      ...resumes[index],
      ...data,
      version: resumes[index].version + 1, // 每次修改版本号 +1
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

// ===== 投递记录 CRUD =====

export const applicationDb = {
  getAll(): Application[] {
    return readData<Application>(STORAGE_KEYS.APPLICATIONS).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  },

  getById(id: string): Application | undefined {
    return readData<Application>(STORAGE_KEYS.APPLICATIONS).find((a) => a.id === id)
  },

  /** 创建投递记录，默认状态为 'applied'，可通过 data.status 指定 */
  create(data: {
    companyName: string
    jobTitle: string
    jobDescription: string
    companyInfo: string
    resumeId: string
    status?: string
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
      status: (data.status as Application['status']) || 'applied',
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

// ===== AI 配置 CRUD =====

export const aiConfigDb = {
  /** 获取配置，合并默认值和用户保存的值（用户配置优先） */
  get(): AIConfig {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AI_CONFIG)
      if (data) return { ...DEFAULT_AI_CONFIG, ...JSON.parse(data) }
    } catch {
      // 解析失败时静默返回默认配置
    }
    return DEFAULT_AI_CONFIG
  },

  /** 增量保存：先读取当前配置，再合并新值写入 */
  save(config: Partial<AIConfig>): AIConfig {
    const current = aiConfigDb.get()
    const updated = { ...current, ...config }
    localStorage.setItem(STORAGE_KEYS.AI_CONFIG, JSON.stringify(updated))
    return updated
  },
}
