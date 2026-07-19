// Tauri v2 应用入口

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod exporter;
mod models;
mod rag;
mod reminder;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");
            let database = db::Database::new(&app_dir).expect("failed to initialize database");
            app.manage(database);

            // The frontend normally reveals the window after its first rendered frame.
            // Keep a timeout fallback so a frontend error cannot leave it hidden forever.
            if let Some(window) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    let _ = window.show();
                });
            }

            Ok(())
        })
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
            commands::get_application_statuses,
            commands::create_application_status,
            commands::update_application_status,
            commands::delete_application_status,
            commands::get_ai_config,
            commands::save_ai_config,
            commands::export_text_file,
            commands::export_pdf_file,
            commands::rag_index_resume,
            commands::rag_delete_resume_index,
            commands::rag_match_resume_job,
            commands::check_interview_reminders,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
