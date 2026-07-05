import type {
  AIConfig,
  AnalyzeRequest,
  Application,
  ApplicationInput,
  RagMatchResult,
  Resume,
  ResumeInput,
} from '@/types'
import { aiConfigDb, applicationDb, resumeDb } from './db'
import { invokeTauri, isTauri } from './platform'
import { matchResumeWithKeywordRag } from './rag'

type ResumeUpdate = Partial<Pick<Resume, 'title' | 'content'>>

export const db = {
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

  aiConfig: {
    async get(): Promise<AIConfig> {
      return isTauri() ? invokeTauri<AIConfig>('get_ai_config') : aiConfigDb.get()
    },

    async save(config: Partial<AIConfig>): Promise<AIConfig> {
      return isTauri() ? invokeTauri<AIConfig>('save_ai_config', { config }) : aiConfigDb.save(config)
    },
  },

  rag: {
    async indexResume(resumeId: string): Promise<void> {
      if (isTauri()) {
        await invokeTauri<void>('rag_index_resume', { resumeId })
      }
    },

    async deleteResumeIndex(resumeId: string): Promise<void> {
      if (isTauri()) {
        await invokeTauri<void>('rag_delete_resume_index', { resumeId })
      }
    },

    async matchResumeJob(request: AnalyzeRequest): Promise<RagMatchResult> {
      return isTauri()
        ? invokeTauri<RagMatchResult>('rag_match_resume_job', { request })
        : matchResumeWithKeywordRag(request)
    },
  },
}
