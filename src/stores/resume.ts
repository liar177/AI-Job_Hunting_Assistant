import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Resume, ResumeInput } from '@/types'
import { db } from '@/utils/db-adapter'

export const useResumeStore = defineStore('resume', () => {
  const resumes = ref<Resume[]>([])
  const loading = ref(false)
  const currentResume = ref<Resume | null>(null)

  // 加载所有简历
  async function loadResumes() {
    loading.value = true
    try {
      resumes.value = await db.resumes.getAll()
    } finally {
      loading.value = false
    }
  }

  // 加载单个简历
  async function loadResume(id: string) {
    currentResume.value = await db.resumes.getById(id) || null
    return currentResume.value
  }

  // 创建简历
  async function createResume(data: ResumeInput) {
    const resume = await db.resumes.create(data)
    await loadResumes()
    void db.rag.indexResume(resume.id).catch(() => {})
    return resume
  }

  // 更新简历
  async function updateResume(id: string, data: { title?: string; content?: string }) {
    const resume = await db.resumes.update(id, data)
    if (resume) {
      await loadResumes()
      if (currentResume.value?.id === id) {
        currentResume.value = resume
      }
      void db.rag.indexResume(resume.id).catch(() => {})
    }
    return resume
  }

  // 删除简历
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
