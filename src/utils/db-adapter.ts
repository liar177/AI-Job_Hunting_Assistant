// 平台适配层 —— 项目最关键的架构设计
//
// 将所有数据操作统一为 async 接口，根据 isTauri() 自动选择后端：
//   桌面端 → invokeTauri() → IPC → Rust/SQLite
//   浏览器 → localStorage CRUD（db.ts）
//
// 设计意图：
//   1. Store 层只面向这个适配器编程，不感知底层是 SQLite 还是 localStorage
//   2. 开发时用浏览器（热更新快），发布时用 Tauri（持久化 + RAG 向量检索）
//   3. 未来可以增加新的后端（如远程 API、IndexedDB），只需在此层切换
//
// RAG 的适配尤为关键：
//   桌面端：走 Rust 端完整 RAG pipeline（embedding 向量搜索 → BM25 降级）
//   浏览器端：走纯 TS 的 BM25 关键词匹配（不依赖任何外部 API）
//   这样即使没有配置 embedding API，浏览器模式也能跑通完整流程。

import type {
  AIConfig,
  AnalyzeRequest,
  Application,
  ApplicationInput,
  ApplicationStatusDefinition,
  ApplicationStatusInput,
  RagMatchResult,
  Resume,
  ResumeInput,
} from '@/types'
import { aiConfigDb, applicationDb, applicationStatusDb, resumeDb } from './db'
import { invokeTauri, isTauri } from './platform'
import { matchResumeWithKeywordRag } from './rag'

type ResumeUpdate = Partial<Pick<Resume, 'title' | 'content'>>

export const db = {
  // ===== 简历 =====
  resumes: {
    async getAll(): Promise<Resume[]> {
      return isTauri() ? invokeTauri<Resume[]>('get_resumes') : resumeDb.getAll()
    },

    async getById(id: string): Promise<Resume | undefined> {
      return isTauri() ? invokeTauri<Resume | undefined>('get_resume', { id }) : resumeDb.getById(id)
    },

    async create(data: ResumeInput): Promise<Resume> {
      return isTauri() ? invokeTauri<Resume>('create_resume', { data }) : resumeDb.create(data)
    },

    async update(id: string, data: ResumeUpdate): Promise<Resume | undefined> {
      return isTauri() ? invokeTauri<Resume | undefined>('update_resume', { id, data }) : resumeDb.update(id, data)
    },

    async delete(id: string): Promise<void> {
      return isTauri() ? invokeTauri<void>('delete_resume', { id }) : resumeDb.delete(id)
    },
  },

  // ===== 投递记录 =====
  applications: {
    async getAll(): Promise<Application[]> {
      return isTauri() ? invokeTauri<Application[]>('get_applications') : applicationDb.getAll()
    },

    async getById(id: string): Promise<Application | undefined> {
      return isTauri() ? invokeTauri<Application | undefined>('get_application', { id }) : applicationDb.getById(id)
    },

    async create(data: ApplicationInput): Promise<Application> {
      return isTauri() ? invokeTauri<Application>('create_application', { data }) : applicationDb.create(data)
    },

    async update(id: string, data: Partial<Application>): Promise<Application | undefined> {
      return isTauri() ? invokeTauri<Application | undefined>('update_application', { id, data }) : applicationDb.update(id, data)
    },

    async delete(id: string): Promise<void> {
      return isTauri() ? invokeTauri<void>('delete_application', { id }) : applicationDb.delete(id)
    },
  },

  // ===== 投递状态定义 =====
  applicationStatuses: {
    async getAll(): Promise<ApplicationStatusDefinition[]> {
      return isTauri()
        ? invokeTauri<ApplicationStatusDefinition[]>('get_application_statuses')
        : applicationStatusDb.getAll()
    },

    async create(data: ApplicationStatusInput): Promise<ApplicationStatusDefinition> {
      return isTauri()
        ? invokeTauri<ApplicationStatusDefinition>('create_application_status', { data })
        : applicationStatusDb.create(data)
    },

    async update(id: string, data: ApplicationStatusInput): Promise<ApplicationStatusDefinition | undefined> {
      return isTauri()
        ? invokeTauri<ApplicationStatusDefinition | undefined>('update_application_status', { id, data })
        : applicationStatusDb.update(id, data)
    },

    async delete(id: string): Promise<void> {
      return isTauri()
        ? invokeTauri<void>('delete_application_status', { id })
        : applicationStatusDb.delete(id)
    },
  },

  // ===== AI 配置 =====
  aiConfig: {
    async get(): Promise<AIConfig> {
      return isTauri() ? invokeTauri<AIConfig>('get_ai_config') : aiConfigDb.get()
    },

    async save(config: Partial<AIConfig>): Promise<AIConfig> {
      return isTauri() ? invokeTauri<AIConfig>('save_ai_config', { config }) : aiConfigDb.save(config)
    },
  },

  // ===== RAG 检索增强生成 =====
  rag: {
    /**
     * 简历索引
     *
     * 桌面端：调用 Rust 端 index_resume()，分块 + 调 embedding API + 存入 SQLite。
     * 浏览器端：什么都不做 —— 浏览器模式在检索时实时切分，不建持久化索引。
     */
    async indexResume(resumeId: string): Promise<void> {
      if (isTauri()) {
        await invokeTauri<void>('rag_index_resume', { resumeId })
      }
    },

    /** 删除简历对应的 RAG 索引（仅桌面端有效） */
    async deleteResumeIndex(resumeId: string): Promise<void> {
      if (isTauri()) {
        await invokeTauri<void>('rag_delete_resume_index', { resumeId })
      }
    },

    /**
     * RAG 匹配：简历 vs JD
     *
     * 桌面端：Rust RAG pipeline（embedding 余弦相似度优先 → BM25 降级）
     * 浏览器端：纯 TS BM25 关键词匹配（零外部依赖，永远可用）
     *
     * 调用方（analyzeResumeOptimizationBasis）不关心走哪条路径，
     * 只关心拿到 RagMatchResult 后注入 Prompt。
     */
    async matchResumeJob(request: AnalyzeRequest): Promise<RagMatchResult> {
      return isTauri()
        ? invokeTauri<RagMatchResult>('rag_match_resume_job', { request })
        : matchResumeWithKeywordRag(request)
    },
  },
}
