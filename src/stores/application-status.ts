import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ApplicationStatusDefinition,
  ApplicationStatusInput,
} from '@/types'
import { db } from '@/utils/db-adapter'
import { setRuntimeStatusDefinitions } from '@/utils/constants'

export const useApplicationStatusStore = defineStore('application-status', () => {
  const statuses = ref<ApplicationStatusDefinition[]>([])
  const loading = ref(false)

  const systemStatuses = computed(() => statuses.value.filter((status) => status.isSystem))
  const customStatuses = computed(() => statuses.value.filter((status) => !status.isSystem))

  function syncRuntimeDefinitions() {
    setRuntimeStatusDefinitions(statuses.value)
  }

  async function loadStatuses() {
    loading.value = true
    try {
      statuses.value = await db.applicationStatuses.getAll()
      syncRuntimeDefinitions()
    } finally {
      loading.value = false
    }
  }

  function assertUniqueName(name: string, exceptId?: string) {
    const normalized = name.trim().toLocaleLowerCase('zh-CN')
    if (statuses.value.some((status) => status.id !== exceptId && status.name.trim().toLocaleLowerCase('zh-CN') === normalized)) {
      throw new Error('状态名称已存在')
    }
  }

  async function createStatus(data: ApplicationStatusInput) {
    assertUniqueName(data.name)
    const status = await db.applicationStatuses.create(data)
    await loadStatuses()
    return status
  }

  async function updateStatus(id: string, data: ApplicationStatusInput) {
    assertUniqueName(data.name, id)
    const status = await db.applicationStatuses.update(id, data)
    await loadStatuses()
    return status
  }

  async function deleteStatus(id: string) {
    await db.applicationStatuses.delete(id)
    await loadStatuses()
  }

  function getById(id: string) {
    return statuses.value.find((status) => status.id === id)
  }

  return {
    statuses,
    loading,
    systemStatuses,
    customStatuses,
    loadStatuses,
    createStatus,
    updateStatus,
    deleteStatus,
    getById,
  }
})
