use crate::db::Database;
use crate::exporter;
use crate::models::{
    AiConfig, AiConfigUpdate, AnalyzeRequest, Application, ApplicationInput, ApplicationUpdate,
    RagMatchResult, Resume, ResumeInput, ResumeUpdate,
};
use crate::rag;
use tauri::State;

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

#[tauri::command]
pub fn delete_resume(db: State<Database>, id: String) -> Result<(), String> {
    db.delete_resume(&id)
}

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

#[tauri::command]
pub fn get_ai_config(db: State<Database>) -> Result<AiConfig, String> {
    db.get_ai_config()
}

#[tauri::command]
pub fn save_ai_config(db: State<Database>, config: AiConfigUpdate) -> Result<AiConfig, String> {
    db.save_ai_config(config)
}

#[tauri::command]
pub fn export_text_file(path: String, content: String) -> Result<String, String> {
    exporter::save_text_file(&path, &content)
}

#[tauri::command]
pub fn export_pdf_file(path: String, title: String, content: String) -> Result<String, String> {
    exporter::save_pdf_file(&path, &title, &content)
}

#[tauri::command]
pub async fn rag_index_resume(db: State<'_, Database>, resume_id: String) -> Result<(), String> {
    rag::index_resume(&db, &resume_id).await
}

#[tauri::command]
pub fn rag_delete_resume_index(db: State<Database>, resume_id: String) -> Result<(), String> {
    db.delete_rag_chunks(&resume_id)
}

#[tauri::command]
pub async fn rag_match_resume_job(
    db: State<'_, Database>,
    request: AnalyzeRequest,
) -> Result<RagMatchResult, String> {
    rag::match_resume_job(&db, request).await
}
