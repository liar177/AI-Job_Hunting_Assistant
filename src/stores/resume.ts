// 简历 Store —— 管理简历列表和当前编辑的简历
//
// 关键设计：createResume / updateResume 成功后，
// 自动触发 fire-and-forget 的 RAG 索引更新（db.rag.indexResume）。
//
// void + .catch(() => {}) 模式的含义：
//   RAG 索引是"尽力而为"的后台任务 —— 索引失败不应阻塞用户操作。
//   用户保存简历后马上就能编辑，索引在后台静默完成。
//   如果索引失败（如 embedding API 挂了），下次检索时
//   needsReindex 会检测到并自动重试。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Resume, ResumeInput } from '@/types'
import { db } from '@/utils/db-adapter'

export const useResumeStore = defineStore('resume', () => {
  const resumes = ref<Resume[]>([])
  const loading = ref(false)
  const currentResume = ref<Resume | null>(null)

  async function loadResumes() {
    loading.value = true
    try {
      resumes.value = await db.resumes.getAll()
    } finally {
      loading.value = false
    }
  }

  async function loadResume(id: string) {
    currentResume.value = await db.resumes.getById(id) || null
    return currentResume.value
  }

  /**
   * 创建简历 + 触发 RAG 索引
   *
   * void db.rag.indexResume(...).catch(() => {}) 是 fire-and-forget 模式：
   * 索引任务在后台执行，成功或失败都不影响 createResume 的返回值。
   */
  async function createResume(data: ResumeInput) {
    const resume = await db.resumes.create(data)
    await loadResumes()
    void db.rag.indexResume(resume.id).catch(() => {}) // 后台建索引，不阻塞
    return resume
  }

  /**
   * 更新简历 + 触发 RAG 重索引
   *
   * 每次更新都会导致 version + 1，Rust 端 needsReindex 函数
   * 通过对比 content_hash 和 resume_version 决定是否重建索引。
   */
  async function updateResume(id: string, data: { title?: string; content?: string }) {
    const resume = await db.resumes.update(id, data)
    if (resume) {
      await loadResumes()
      if (currentResume.value?.id === id) {
        currentResume.value = resume
      }
      void db.rag.indexResume(resume.id).catch(() => {}) // 内容变化后重索引
    }
    return resume
  }

  /** 删除简历时同步清理 RAG 索引 */
  async function deleteResume(id: string) {
    await db.resumes.delete(id)
    await db.rag.deleteResumeIndex(id).catch(() => {})
    await loadResumes()
    if (currentResume.value?.id === id) {
      currentResume.value = null
    }
  }

  return {
    resumes,
    loading,
    currentResume,
    loadResumes,
    loadResume,
    createResume,
    updateResume,
    deleteResume,
  }
})
