// Tauri IPC 命令 —— 前端与 Rust 后端的桥梁
//
// 每个 #[tauri::command] 函数对应前端通过 invokeTauri() 调用的一个命令。
// 函数签名中的 State<Database> 由 Tauri 自动注入（在 main.rs setup 中注册）。
//
// 设计原则：
//   命令函数是"薄层"——只做参数转发，业务逻辑在 db / rag / exporter 模块中。
//   这保持了命令层的简洁性，也让核心逻辑可以脱离 Tauri 框架单独测试。
//
// async 命令：
//   rag_index_resume 和 rag_match_resume_job 是 async 的，
//   因为它们内部需要调用外部 HTTP API（embedding 服务），
//   使用 async 避免阻塞 Tauri 的主事件循环。
//
// 19 个命令覆盖了：
//   简历 CRUD（5 个）
//   投递 CRUD（5 个）
//   AI 配置（2 个）
//   文件导出（2 个）
//   RAG 全链路（3 个）
//   测试连接（2 个）

use crate::db::Database;
use crate::exporter;
use crate::models::{
    AiConfig, AiConfigUpdate, AnalyzeRequest, Application, ApplicationInput, ApplicationUpdate,
    RagMatchResult, Resume, ResumeInput, ResumeUpdate,
};
use crate::rag;
use tauri::State;

// ===== 简历命令 =====

#[tauri::command]
pub fn get_resumes(db: State<Database>) -> Result<Vec<Resume>, String> {
    db.get_resumes()
}

#[tauri::command]
pub fn get_resume(db: State<Database>, id: String) -> Result<Option<Resume>, String> {
    db.get_resume(&id)
}

#[tauri::command]
pub fn create_resume(db: State<Database>, data: ResumeInput) -> Result<Resume, String> {
    db.create_resume(data)
}

#[tauri::command]
pub fn update_resume(
    db: State<Database>,
    id: String,
    data: ResumeUpdate,
) -> Result<Option<Resume>, String> {
    db.update_resume(&id, data)
}

/// 删除简历：DB 层自动级联删除关联的 RAG chunks
#[tauri::command]
pub fn delete_resume(db: State<Database>, id: String) -> Result<(), String> {
    db.delete_resume(&id)
}

// ===== 投递记录命令 =====

#[tauri::command]
pub fn get_applications(db: State<Database>) -> Result<Vec<Application>, String> {
    db.get_applications()
}

#[tauri::command]
pub fn get_application(db: State<Database>, id: String) -> Result<Option<Application>, String> {
    db.get_application(&id)
}

#[tauri::command]
pub fn create_application(
    db: State<Database>,
    data: ApplicationInput,
) -> Result<Application, String> {
    db.create_application(data)
}

#[tauri::command]
pub fn update_application(
    db: State<Database>,
    id: String,
    data: ApplicationUpdate,
) -> Result<Option<Application>, String> {
    db.update_application(&id, data)
}

#[tauri::command]
pub fn delete_application(db: State<Database>, id: String) -> Result<(), String> {
    db.delete_application(&id)
}

// ===== AI 配置命令 =====

#[tauri::command]
pub fn get_ai_config(db: State<Database>) -> Result<AiConfig, String> {
    db.get_ai_config()
}

/// 保存 AI 配置（使用 UPSERT，单行维护）
#[tauri::command]
pub fn save_ai_config(db: State<Database>, config: AiConfigUpdate) -> Result<AiConfig, String> {
    db.save_ai_config(config)
}

// ===== 文件导出命令 =====

/// 导出纯文本文件（MD/TXT/JSON）
#[tauri::command]
pub fn export_text_file(path: String, content: String) -> Result<String, String> {
    exporter::save_text_file(&path, &content)
}

/// 导出 PDF 文件（手动构建，无外部 PDF 库依赖）
#[tauri::command]
pub fn export_pdf_file(path: String, title: String, content: String) -> Result<String, String> {
    exporter::save_pdf_file(&path, &title, &content)
}

// ===== RAG 命令 =====

/// 简历索引（async：内部调 embedding API 需网络请求）
///
/// 由前端 Store 在简历保存/更新后 fire-and-forget 调用。
/// 失败不阻塞前端操作（Store 用了 .catch(() => {})）。
#[tauri::command]
pub async fn rag_index_resume(db: State<'_, Database>, resume_id: String) -> Result<(), String> {
    rag::index_resume(&db, &resume_id).await
}

/// 删除简历的 RAG 索引
#[tauri::command]
pub fn rag_delete_resume_index(db: State<Database>, resume_id: String) -> Result<(), String> {
    db.delete_rag_chunks(&resume_id)
}

/// RAG 匹配：简历 vs JD（async：内部可能调 embedding API）
///
/// 这是 Customize 工作流 Step 1 的核心依赖。
/// 前端 analyzeResumeOptimizationBasis 会先调此命令获取 RAG 匹配结果，
/// 再将结果注入 Prompt 调用 LLM。
#[tauri::command]
pub async fn rag_match_resume_job(
    db: State<'_, Database>,
    request: AnalyzeRequest,
) -> Result<RagMatchResult, String> {
    rag::match_resume_job(&db, request).await
}
