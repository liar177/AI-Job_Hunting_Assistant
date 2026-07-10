// 投递记录 Store
//
// 管理投递记录列表、当前记录、筛选状态和统计数据。
// 使用 Vue computed 实现状态筛选和搜索过滤，数据量小时性能足够。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Application, ApplicationInput, ApplicationStatus } from '@/types'
import { db } from '@/utils/db-adapter'
import {
  collectInterviewItems,
  getUpcomingInterviewItems,
  needsInterviewInfo,
} from '@/utils/interview'

export const useApplicationStore = defineStore('application', () => {
  const applications = ref<Application[]>([])
  const currentApplication = ref<Application | null>(null)
  const filterStatus = ref<ApplicationStatus | 'all'>('all')
  const searchQuery = ref('')

  /**
   * 前端过滤：状态筛选 + 关键词搜索
   *
   * 数据量（投递记录数）通常较小，用 computed 做前端过滤足够高效，
   * 不需要后端分页或数据库查询。
   */
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

  /**
   * 统计数据：按状态分组计数
   *
   * interviewing 汇总了 technical + hr + boss 三种面试类型，
   * 因为从用户角度看这些都是"面试中"。
   */
  const stats = computed(() => {
    const total = applications.value.length
    const byStatus = (status: ApplicationStatus) =>
      applications.value.filter((a) => a.status === status).length
    const allInterviews = collectInterviewItems(applications.value)
    const todayKey = new Date().toLocaleDateString('zh-CN')
    return {
      total,
      applied: byStatus('applied'),
      interviewing: byStatus('technical') + byStatus('hr') + byStatus('boss'),
      upcomingInterviews: getUpcomingInterviewItems(applications.value).length,
      todayInterviews: allInterviews.filter(
        (item) => new Date(item.schedule.interviewAt).toLocaleDateString('zh-CN') === todayKey
      ).length,
      missingInterviewInfo: applications.value.filter(needsInterviewInfo).length,
      offer: byStatus('offer'),
      rejected: byStatus('rejected'),
    }
  })

  const interviewItems = computed(() => collectInterviewItems(applications.value))
  const upcomingInterviewItems = computed(() => getUpcomingInterviewItems(applications.value))
  const missingInterviewApplications = computed(() => applications.value.filter(needsInterviewInfo))

  async function loadApplications() {
    applications.value = await db.applications.getAll()
  }

  async function loadApplication(id: string) {
    currentApplication.value = await db.applications.getById(id) || null
    return currentApplication.value
  }

  async function createApplication(data: ApplicationInput) {
    const application = await db.applications.create(data)
    await loadApplications()
    return application
  }

  async function updateApplication(id: string, data: Partial<Application>) {
    const application = await db.applications.update(id, data)
    if (application) {
      await loadApplications()
      if (currentApplication.value?.id === id) {
        currentApplication.value = application
      }
    }
    return application
  }

  /** 便捷方法：只更新投递状态 */
  async function updateStatus(id: string, status: ApplicationStatus) {
    return updateApplication(id, { status })
  }

  async function deleteApplication(id: string) {
    await db.applications.delete(id)
    await loadApplications()
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
    interviewItems,
    upcomingInterviewItems,
    missingInterviewApplications,
    loadApplications,
    loadApplication,
    createApplication,
    updateApplication,
    updateStatus,
    deleteApplication,
  }
})
