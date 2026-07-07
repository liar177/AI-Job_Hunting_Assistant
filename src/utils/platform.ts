// 平台检测与 Tauri IPC 封装
//
// 核心设计意图：
// 同一份前端代码需要同时支持两种运行环境：
//   1. 浏览器开发模式 — 热更新快，调试方便，数据存 localStorage
//   2. Tauri 桌面应用 — 通过 IPC 调用 Rust 后端，数据存 SQLite
//
// isTauri() 是平台适配的「开关」—— 所有需要区分环境的地方都通过它判断。
// Tauri 注入的 window.__TAURI_INTERNALS__ 是判断依据，不存在即为浏览器模式。
//
// invokeTauri() 使用动态 import() 而非顶层 import，原因：
// 浏览器环境下 @tauri-apps/api 包不存在，顶层 import 会导致整个模块加载失败。
// 动态 import 只在 isTauri() 为 true 时才执行，浏览器端永远不会触发，所以安全。

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

/** 判断当前是否运行在 Tauri 桌面环境中 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

/**
 * 调用 Tauri Rust 后端命令
 *
 * 使用动态 import 延迟加载 @tauri-apps/api/core，
 * 避免浏览器环境下因包不存在导致模块加载失败。
 *
 * @param command  Rust 侧注册的命令名（如 'get_resumes'）
 * @param args     可选参数，会自动序列化为 JSON 通过 IPC 传递
 * @returns        Rust 命令的返回值（JSON 反序列化后的 TS 类型）
 */
export async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}
