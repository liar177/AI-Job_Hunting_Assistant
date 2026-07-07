// Tauri v2 应用入口
//
// 架构要点：
//   1. windows_subsystem = "windows" 在 release 模式下隐藏控制台窗口
//   2. setup 钩子中初始化数据库，通过 app.manage() 注入为 Tauri 托管状态
//      —— 之后所有 #[tauri::command] 函数可以通过 State<Database> 访问数据库
//   3. 19 个注册命令覆盖了简历 CRUD、投递 CRUD、AI 配置、文件导出、RAG 全链路
//   4. 两个插件：tauri_plugin_opener（打开文件/URL）、tauri_plugin_dialog（文件对话框）
//
// State 管理是 Tauri 的依赖注入机制：
//   app.manage(database) 注册 → 命令函数参数 State<Database> 自动注入
//   无需全局变量，线程安全（Mutex<Connection> 保证）

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod exporter;
mod models;
mod rag;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 获取 Tauri 应用数据目录（Windows: %APPDATA%/...）
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");
            // 初始化 SQLite 数据库并注入为全局 State
            let database = db::Database::new(&app_dir).expect("failed to initialize database");
            app.manage(database);
            Ok(())
        })
        // 注册所有 IPC 命令，前端通过 invoke('command_name', args) 调用
        .invoke_handler(tauri::generate_handler![
            commands::get_resumes,
            commands::get_resume,
            commands::create_resume,
            commands::update_resume,
            commands::delete_resume,
            commands::get_applications,
            commands::get_application,
            commands::create_application,
            commands::update_application,
            commands::delete_application,
            commands::get_ai_config,
            commands::save_ai_config,
            commands::export_text_file,
            commands::export_pdf_file,
            commands::rag_index_resume,
            commands::rag_delete_resume_index,
            commands::rag_match_resume_job,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
