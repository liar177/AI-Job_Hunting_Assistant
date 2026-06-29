import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Application, ApplicationStatus } from '@/types'
import { applicationDb } from '@/utils/db'

export const useApplicationStore = defineStore('application', () => {
  const applications = ref<Application[]>([])
  const currentApplication = ref<Application | null>(null)
  const filterStatus = ref<ApplicationStatus | 'all'>('all')
  const searchQuery = ref('')

  // 过滤后的投递记录
  const filteredApplications = computed(() => {
    let result = applications.value
    if (filterStatus.value !== 'all') {
      result = result.filter((a) => a.status === filterStatus.value)
    }
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(
        (a) =>
          a.companyName.toLowerCase().includes(query) ||
          a.jobTitle.toLowerCase().includes(query)
      )
    }
    return result
  })

  // 统计数据
  const stats = computed(() => {
    const total = applications.value.length
    const byStatus = (status: ApplicationStatus) =>
      applications.value.filter((a) => a.status === status).length
    return {
      total,
      applied: byStatus('applied'),
      interviewing: byStatus('technical') + byStatus('hr') + byStatus('boss'),
      offer: byStatus('offer'),
      rejected: byStatus('rejected'),
    }
  })

  // 加载所有投递记录
  function loadApplications() {
    applications.value = applicationDb.getAll()
  }

  // 加载单个投递记录
  function loadApplication(id: string) {
    currentApplication.value = applicationDb.getById(id) || null
    return currentApplication.value
  }

  // 创建投递记录
  function createApplication(data: {
    companyName: string
    jobTitle: string
    jobDescription: string
    companyInfo: string
    resumeId: string
    notes?: string
  }) {
    const application = applicationDb.create(data)
    loadApplications()
    return application
  }

  // 更新投递记录
  function updateApplication(id: string, data: Partial<Application>) {
    const application = applicationDb.update(id, data)
    if (application) {
      loadApplications()
      if (currentApplication.value?.id === id) {
        currentApplication.value = application
      }
    }
    return application
  }

  // 更新状态
  function updateStatus(id: string, status: ApplicationStatus) {
    return updateApplication(id, { status })
  }

  // 删除投递记录
  function deleteApplication(id: string) {
    applicationDb.delete(id)
    loadApplications()
    if (currentApplication.value?.id === id) {
      currentApplication.value = null
    }
  }

  return {
    applications,
    currentApplication,
    filterStatus,
    searchQuery,
    filteredApplications,
    stats,
    loadApplications,
    loadApplication,
    createApplication,
    updateApplication,
    updateStatus,
    deleteApplication,
  }
})
