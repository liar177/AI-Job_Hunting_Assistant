import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Resume } from '@/types'
import { resumeDb } from '@/utils/db'

export const useResumeStore = defineStore('resume', () => {
  const resumes = ref<Resume[]>([])
  const loading = ref(false)
  const currentResume = ref<Resume | null>(null)

  // 加载所有简历
  function loadResumes() {
    resumes.value = resumeDb.getAll()
  }

  // 加载单个简历
  function loadResume(id: string) {
    currentResume.value = resumeDb.getById(id) || null
    return currentResume.value
  }

  // 创建简历
  function createResume(data: { title: string; content: string; originalContent: string }) {
    const resume = resumeDb.create(data)
    loadResumes()
    return resume
  }

  // 更新简历
  function updateResume(id: string, data: { title?: string; content?: string }) {
    const resume = resumeDb.update(id, data)
    if (resume) {
      loadResumes()
      if (currentResume.value?.id === id) {
        currentResume.value = resume
      }
    }
    return resume
  }

  // 删除简历
  function deleteResume(id: string) {
    resumeDb.delete(id)
    loadResumes()
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
