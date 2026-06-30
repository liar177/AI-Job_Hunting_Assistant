import { ElMessage } from 'element-plus'

export type MessageType = 'success' | 'warning' | 'error' | 'info'

export function showMessage(message: string, type: MessageType = 'success') {
  ElMessage({
    message,
    type,
    duration: 3000,
    showClose: true,
  })
}

export function showSuccess(message: string) {
  showMessage(message, 'success')
}

export function showError(message: string) {
  showMessage(message, 'error')
}

export function showWarning(message: string) {
  showMessage(message, 'warning')
}

export function showInfo(message: string) {
  showMessage(message, 'info')
}
