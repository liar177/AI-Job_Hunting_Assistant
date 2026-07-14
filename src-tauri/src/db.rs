// SQLite 数据库层
//
// 设计要点：
//   1. Mutex<Connection> —— rusqlite::Connection 不是 Sync 的，
//      用 Mutex 保证多线程安全。Tauri 可能在多个 async 任务中并发访问。
//   2. 向量存储 —— embedding 以 BLOB 形式存储（f32 小端字节 → Vec<u8>），
//      而非 JSON 序列化，节省空间且读取更快。
//   3. AI 配置用 ON CONFLICT DO UPDATE（UPSERT）—— 只保留一行（id='default'），
//      不需要判断新增还是更新。
//   4. replace_rag_chunks 用事务包裹（DELETE + INSERT in transaction），
//      保证索引替换的原子性。
//   5. 删除简历时级联删除 RAG chunks（DELETE FROM rag_chunks WHERE resume_id=?）
//
// 四个表：
//   resumes       —— 简历
//   applications  —— 投递记录
//   ai_config     —— AI 配置（单行，id='default'）
//   rag_chunks    —— RAG 分块 + 嵌入向量

use crate::models::{
    AiConfig, AiConfigUpdate, Application, ApplicationInput, ApplicationStatusDefinition,
    ApplicationStatusInput, ApplicationUpdate, RagChunk, Resume, ResumeInput, ResumeUpdate,
};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;
use uuid::Uuid;

pub struct Database {
    conn: Mutex<Connection>,
}

pub fn now() -> String {
    Utc::now().to_rfc3339()
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// f32 向量序列化为字节数组（小端序）
///
/// 为什么不存 JSON？
///   1024 维 × 4 字节 = 4KB/块，JSON 序列化会膨胀到 ~12KB（带逗号空格）。
///   BLOB 直接存原始字节，查询后用 blob_to_floats 还原。
fn floats_to_blob(values: &[f32]) -> Vec<u8> {
    values
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect::<Vec<u8>>()
}

/// BLOB 反序列化为 f32 向量
///
/// chunks_exact(4) 处理 4 字节一组（f32），忽略不完整的尾部。
/// 如果 BLOB 为 NULL（未配置 embedding），返回 None。
fn blob_to_floats(blob: Option<Vec<u8>>) -> Option<Vec<f32>> {
    blob.map(|bytes| {
        bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect()
    })
}

impl Database {
    /// 初始化数据库：创建目录 + 建表
    ///
    /// CREATE TABLE IF NOT EXISTS 保证幂等性 —— 每次启动都安全调用。
    /// 索引建在 RAG 查询的高频过滤条件上：
    ///   - resume_id（按简历查 chunks）
    ///   - resume_id + resume_version（增量判断用）
    ///   - resume_id + content_hash（判断内容是否变化）
    pub fn new(app_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(app_dir).map_err(|err| err.to_string())?;
        let conn = Connection::open(app_dir.join("data.db")).map_err(|err| err.to_string())?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS resumes (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              original_content TEXT NOT NULL,
              version INTEGER NOT NULL DEFAULT 1,
              source_type TEXT DEFAULT 'manual',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS applications (
              id TEXT PRIMARY KEY,
              company_name TEXT NOT NULL,
              job_title TEXT NOT NULL,
              job_description TEXT NOT NULL,
              company_info TEXT DEFAULT '',
              resume_id TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'applied',
              interviews TEXT DEFAULT '{}',
              notes TEXT DEFAULT '',
              applied_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (resume_id) REFERENCES resumes(id)
            );

            CREATE TABLE IF NOT EXISTS application_statuses (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              description TEXT NOT NULL DEFAULT '',
              color TEXT NOT NULL DEFAULT 'gray',
              requires_interview_schedule INTEGER NOT NULL DEFAULT 0,
              is_system INTEGER NOT NULL DEFAULT 0,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_config (
              id TEXT PRIMARY KEY DEFAULT 'default',
              provider TEXT NOT NULL DEFAULT 'deepseek',
              api_key TEXT DEFAULT '',
              model TEXT NOT NULL DEFAULT 'deepseek-chat',
              base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
              rag_mode TEXT NOT NULL DEFAULT 'auto',
              embedding_provider TEXT NOT NULL DEFAULT 'aliyun-bailian',
              embedding_api_key TEXT DEFAULT '',
              embedding_model TEXT NOT NULL DEFAULT 'text-embedding-v4',
              embedding_endpoint TEXT NOT NULL DEFAULT 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
              embedding_dimension INTEGER
            );

            CREATE TABLE IF NOT EXISTS rag_chunks (
              id TEXT PRIMARY KEY,
              resume_id TEXT NOT NULL,
              resume_version INTEGER NOT NULL,
              content_hash TEXT NOT NULL,
              chunk_index INTEGER NOT NULL,
              chunk_type TEXT NOT NULL,
              section_title TEXT DEFAULT '',
              chunk_text TEXT NOT NULL,
              embedding_provider TEXT,
              embedding_model TEXT,
              embedding_dim INTEGER,
              embedding BLOB,
              embedding_created_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_applications_resume_id ON applications(resume_id);
            CREATE INDEX IF NOT EXISTS idx_application_statuses_sort ON application_statuses(sort_order);
            CREATE INDEX IF NOT EXISTS idx_rag_chunks_resume_id ON rag_chunks(resume_id);
            CREATE INDEX IF NOT EXISTS idx_rag_chunks_resume_version ON rag_chunks(resume_id, resume_version);
            CREATE INDEX IF NOT EXISTS idx_rag_chunks_hash ON rag_chunks(resume_id, content_hash);
            "#,
        )
        .map_err(|err| err.to_string())?;

        // 向前兼容：为旧版数据库添加 interviews 列（如果不存在）
        conn.execute(
            "ALTER TABLE applications ADD COLUMN interviews TEXT DEFAULT '{}'",
            [],
        )
        .ok();

        let seed_time = "2026-01-01T00:00:00.000Z";
        let system_statuses = [
            (
                "applied",
                "已投递",
                "已完成岗位投递，等待后续反馈",
                "blue",
                0,
                10,
            ),
            ("hr_read", "HR已读", "招聘方已查看投递材料", "cyan", 0, 20),
            (
                "screen_pass",
                "初筛通过",
                "简历筛选通过，等待下一步安排",
                "cyan",
                0,
                30,
            ),
            ("technical", "技术面", "进入技术面试阶段", "purple", 1, 40),
            ("hr", "HR面", "进入 HR 面试阶段", "purple", 1, 50),
            ("boss", "Boss面", "进入负责人面试阶段", "amber", 1, 60),
            (
                "offer",
                "已Offer",
                "已收到录用意向或正式 Offer",
                "green",
                0,
                70,
            ),
            ("rejected", "已挂", "本次投递流程已结束", "red", 0, 80),
            ("accepted", "已接", "已接受 Offer", "green", 0, 90),
        ];
        for (id, name, description, color, requires_interview, sort_order) in system_statuses {
            conn.execute(
                "INSERT OR IGNORE INTO application_statuses
                 (id, name, description, color, requires_interview_schedule, is_system, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?7)",
                params![id, name, description, color, requires_interview, sort_order, seed_time],
            )
            .map_err(|err| err.to_string())?;
        }

        Ok(())
    }

    pub fn default_config() -> AiConfig {
        AiConfig {
            id: "default".to_string(),
            provider: "deepseek".to_string(),
            api_key: String::new(),
            model: "deepseek-chat".to_string(),
            base_url: "https://api.deepseek.com/v1".to_string(),
            rag_mode: "auto".to_string(),
            embedding_provider: "aliyun-bailian".to_string(),
            embedding_api_key: String::new(),
            embedding_model: "text-embedding-v4".to_string(),
            embedding_endpoint: "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding".to_string(),
            embedding_dimension: None,
        }
    }

    // ===== 简历 CRUD =====

    pub fn get_resumes(&self) -> Result<Vec<Resume>, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, title, content, original_content, source_type, version, created_at, updated_at
             FROM resumes ORDER BY datetime(updated_at) DESC",
        ).map_err(|err| err.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Resume {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    original_content: row.get(3)?,
                    source_type: row.get(4)?,
                    version: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .map_err(|err| err.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    }

    /// 按 ID 查询简历，使用 optional() 优雅处理不存在的情况
    pub fn get_resume(&self, id: &str) -> Result<Option<Resume>, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.query_row(
            "SELECT id, title, content, original_content, source_type, version, created_at, updated_at FROM resumes WHERE id = ?1",
            params![id],
            |row| {
                Ok(Resume {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    original_content: row.get(3)?,
                    source_type: row.get(4)?,
                    version: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .optional() // 0行 → Ok(None)，1行 → Ok(Some(...))，>1行 → 错误
        .map_err(|err| err.to_string())
    }

    pub fn create_resume(&self, data: ResumeInput) -> Result<Resume, String> {
        let resume = Resume {
            id: new_id(),
            title: data.title,
            content: data.content,
            original_content: data.original_content,
            source_type: data.source_type.or_else(|| Some("manual".to_string())),
            version: 1,
            created_at: now(),
            updated_at: now(),
        };
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "INSERT INTO resumes (id, title, content, original_content, source_type, version, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                resume.id,
                resume.title,
                resume.content,
                resume.original_content,
                resume.source_type,
                resume.version,
                resume.created_at,
                resume.updated_at
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(resume)
    }

    /// 更新简历：先读出当前版本，合并字段，version + 1，写回
    ///
    /// 为什么不用 UPDATE ... SET version = version + 1 直接更新？
    ///   因为要返回完整的更新后 Resume 对象给前端，
    ///   直接 SQL 更新后还需要再查一次，不如先读-改-写。
    pub fn update_resume(&self, id: &str, data: ResumeUpdate) -> Result<Option<Resume>, String> {
        let current = match self.get_resume(id)? {
            Some(resume) => resume,
            None => return Ok(None),
        };
        let updated = Resume {
            title: data.title.unwrap_or(current.title),
            content: data.content.unwrap_or(current.content),
            version: current.version + 1, // 版本号递增，触发 RAG 重索引
            updated_at: now(),
            ..current
        };
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "UPDATE resumes SET title = ?1, content = ?2, version = ?3, updated_at = ?4 WHERE id = ?5",
            params![updated.title, updated.content, updated.version, updated.updated_at, id],
        )
        .map_err(|err| err.to_string())?;
        Ok(Some(updated))
    }

    /// 删除简历时同时删除关联的 RAG chunks
    pub fn delete_resume(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM resumes WHERE id = ?1", params![id])
            .map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM rag_chunks WHERE resume_id = ?1", params![id])
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    // ===== 投递记录 CRUD =====

    pub fn get_applications(&self) -> Result<Vec<Application>, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, company_name, job_title, job_description, company_info, resume_id, status, interviews, notes, applied_at, updated_at
             FROM applications ORDER BY datetime(updated_at) DESC",
        ).map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let interviews_json: String = row.get::<_, String>(7).unwrap_or_default();
                Ok(Application {
                    id: row.get(0)?,
                    company_name: row.get(1)?,
                    job_title: row.get(2)?,
                    job_description: row.get(3)?,
                    company_info: row.get(4)?,
                    resume_id: row.get(5)?,
                    status: row.get(6)?,
                    interviews: serde_json::from_str(&interviews_json).ok(),
                    notes: row.get(8)?,
                    applied_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    }

    pub fn get_application(&self, id: &str) -> Result<Option<Application>, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.query_row(
            "SELECT id, company_name, job_title, job_description, company_info, resume_id, status, interviews, notes, applied_at, updated_at
             FROM applications WHERE id = ?1",
            params![id],
            |row| {
                let interviews_json: String = row.get::<_, String>(7).unwrap_or_default();
                Ok(Application {
                    id: row.get(0)?,
                    company_name: row.get(1)?,
                    job_title: row.get(2)?,
                    job_description: row.get(3)?,
                    company_info: row.get(4)?,
                    resume_id: row.get(5)?,
                    status: row.get(6)?,
                    interviews: serde_json::from_str(&interviews_json).ok(),
                    notes: row.get(8)?,
                    applied_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )
        .optional()
        .map_err(|err| err.to_string())
    }

    pub fn create_application(&self, data: ApplicationInput) -> Result<Application, String> {
        let application = Application {
            id: new_id(),
            company_name: data.company_name,
            job_title: data.job_title,
            job_description: data.job_description,
            company_info: data.company_info,
            resume_id: data.resume_id,
            status: data.status.unwrap_or_else(|| "applied".to_string()),
            interviews: None,
            notes: data.notes.unwrap_or_default(),
            applied_at: now(),
            updated_at: now(),
        };
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "INSERT INTO applications (id, company_name, job_title, job_description, company_info, resume_id, status, interviews, notes, applied_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                application.id,
                application.company_name,
                application.job_title,
                application.job_description,
                application.company_info,
                application.resume_id,
                application.status,
                "{}", // interviews: 新建时为空
                application.notes,
                application.applied_at,
                application.updated_at
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(application)
    }

    pub fn update_application(
        &self,
        id: &str,
        data: ApplicationUpdate,
    ) -> Result<Option<Application>, String> {
        let current = match self.get_application(id)? {
            Some(application) => application,
            None => return Ok(None),
        };
        let interviews = data.interviews.or(current.interviews);
        let interviews_json = interviews
            .as_ref()
            .and_then(|i| serde_json::to_string(i).ok())
            .unwrap_or_else(|| "{}".to_string());

        let updated = Application {
            company_name: data.company_name.unwrap_or(current.company_name),
            job_title: data.job_title.unwrap_or(current.job_title),
            job_description: data.job_description.unwrap_or(current.job_description),
            company_info: data.company_info.unwrap_or(current.company_info),
            resume_id: data.resume_id.unwrap_or(current.resume_id),
            status: data.status.unwrap_or(current.status),
            interviews,
            notes: data.notes.unwrap_or(current.notes),
            updated_at: now(),
            ..current
        };
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "UPDATE applications
             SET company_name = ?1, job_title = ?2, job_description = ?3, company_info = ?4, resume_id = ?5, status = ?6, notes = ?7, interviews = ?8, updated_at = ?9
             WHERE id = ?10",
            params![
                updated.company_name,
                updated.job_title,
                updated.job_description,
                updated.company_info,
                updated.resume_id,
                updated.status,
                updated.notes,
                interviews_json,
                updated.updated_at,
                id
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(Some(updated))
    }

    pub fn delete_application(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM applications WHERE id = ?1", params![id])
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    // ===== 投递状态定义 CRUD =====

    pub fn get_application_statuses(&self) -> Result<Vec<ApplicationStatusDefinition>, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, name, description, color, requires_interview_schedule, is_system, sort_order, created_at, updated_at
             FROM application_statuses ORDER BY sort_order ASC, datetime(created_at) ASC",
        ).map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ApplicationStatusDefinition {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    color: row.get(3)?,
                    requires_interview_schedule: row.get::<_, i64>(4)? != 0,
                    is_system: row.get::<_, i64>(5)? != 0,
                    sort_order: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    }

    pub fn create_application_status(
        &self,
        data: ApplicationStatusInput,
    ) -> Result<ApplicationStatusDefinition, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        let duplicate_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM application_statuses WHERE lower(name) = lower(?1)",
                params![data.name.trim()],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        if duplicate_count > 0 {
            return Err("状态名称已存在".to_string());
        }
        let sort_order: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), 0) + 10 FROM application_statuses",
                [],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        let timestamp = now();
        let status = ApplicationStatusDefinition {
            id: format!("custom_{}", new_id()),
            name: data.name.trim().to_string(),
            description: data.description.trim().to_string(),
            color: data.color,
            requires_interview_schedule: data.requires_interview_schedule,
            is_system: false,
            sort_order,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        conn.execute(
            "INSERT INTO application_statuses
             (id, name, description, color, requires_interview_schedule, is_system, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8)",
            params![status.id, status.name, status.description, status.color, status.requires_interview_schedule, status.sort_order, status.created_at, status.updated_at],
        ).map_err(|err| err.to_string())?;
        Ok(status)
    }

    pub fn update_application_status(
        &self,
        id: &str,
        data: ApplicationStatusInput,
    ) -> Result<Option<ApplicationStatusDefinition>, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        let is_system = conn
            .query_row(
                "SELECT is_system FROM application_statuses WHERE id = ?1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|err| err.to_string())?;
        match is_system {
            None => return Ok(None),
            Some(value) if value != 0 => return Err("系统状态不能编辑".to_string()),
            _ => {}
        }
        let duplicate_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM application_statuses WHERE lower(name) = lower(?1) AND id != ?2",
            params![data.name.trim(), id],
            |row| row.get(0),
        ).map_err(|err| err.to_string())?;
        if duplicate_count > 0 {
            return Err("状态名称已存在".to_string());
        }
        let updated_at = now();
        conn.execute(
            "UPDATE application_statuses SET name = ?1, description = ?2, color = ?3,
             requires_interview_schedule = ?4, updated_at = ?5 WHERE id = ?6",
            params![
                data.name.trim(),
                data.description.trim(),
                data.color,
                data.requires_interview_schedule,
                updated_at,
                id
            ],
        )
        .map_err(|err| err.to_string())?;
        drop(conn);
        Ok(self
            .get_application_statuses()?
            .into_iter()
            .find(|status| status.id == id))
    }

    pub fn delete_application_status(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        let is_system = conn
            .query_row(
                "SELECT is_system FROM application_statuses WHERE id = ?1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|err| err.to_string())?;
        match is_system {
            None => return Ok(()),
            Some(value) if value != 0 => return Err("系统状态不能删除".to_string()),
            _ => {}
        }
        let usage_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM applications WHERE status = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        if usage_count > 0 {
            return Err("该状态正在被投递记录使用，请先迁移相关投递".to_string());
        }
        conn.execute(
            "DELETE FROM application_statuses WHERE id = ?1",
            params![id],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    }

    /// 标记某个面试阶段的提醒已发送
    /// reminder_type: "1d" 或 "3h"
    pub fn mark_reminder_sent(
        &self,
        app_id: &str,
        stage: &str,
        reminder_type: &str,
    ) -> Result<(), String> {
        let app = self
            .get_application(app_id)?
            .ok_or("application not found")?;
        let mut interviews = app.interviews.clone().unwrap_or_default();

        if let Some(schedule) = interviews.get_mut(stage) {
            match reminder_type {
                "1d" => schedule.reminder_sent_1d = Some(true),
                "3h" => schedule.reminder_sent_3h = Some(true),
                _ => {}
            }
        }

        let interviews_json =
            serde_json::to_string(&interviews).unwrap_or_else(|_| "{}".to_string());
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "UPDATE applications SET interviews = ?1, updated_at = ?2 WHERE id = ?3",
            params![interviews_json, now(), app_id],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    }

    // ===== AI 配置 =====

    /// 获取配置，不存在时返回默认配置（不会返回 Err）
    pub fn get_ai_config(&self) -> Result<AiConfig, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        let config = conn.query_row(
            "SELECT id, provider, api_key, model, base_url, rag_mode, embedding_provider, embedding_api_key, embedding_model, embedding_endpoint, embedding_dimension
             FROM ai_config WHERE id = 'default'",
            [],
            |row| {
                Ok(AiConfig {
                    id: row.get(0)?,
                    provider: row.get(1)?,
                    api_key: row.get(2)?,
                    model: row.get(3)?,
                    base_url: row.get(4)?,
                    rag_mode: row.get(5)?,
                    embedding_provider: row.get(6)?,
                    embedding_api_key: row.get(7)?,
                    embedding_model: row.get(8)?,
                    embedding_endpoint: row.get(9)?,
                    embedding_dimension: row.get(10)?,
                })
            },
        )
        .optional()
        .map_err(|err| err.to_string())?;
        Ok(config.unwrap_or_else(Self::default_config))
    }

    /// 使用 INSERT ... ON CONFLICT DO UPDATE（UPSERT）
    /// 只维护一行配置（id='default'），不需要判断增删
    pub fn save_ai_config(&self, data: AiConfigUpdate) -> Result<AiConfig, String> {
        let current = self.get_ai_config()?;
        let updated = AiConfig {
            id: data.id.unwrap_or(current.id),
            provider: data.provider.unwrap_or(current.provider),
            api_key: data.api_key.unwrap_or(current.api_key),
            model: data.model.unwrap_or(current.model),
            base_url: data.base_url.unwrap_or(current.base_url),
            rag_mode: data.rag_mode.unwrap_or(current.rag_mode),
            embedding_provider: data
                .embedding_provider
                .unwrap_or(current.embedding_provider),
            embedding_api_key: data.embedding_api_key.unwrap_or(current.embedding_api_key),
            embedding_model: data.embedding_model.unwrap_or(current.embedding_model),
            embedding_endpoint: data
                .embedding_endpoint
                .unwrap_or(current.embedding_endpoint),
            embedding_dimension: data.embedding_dimension.or(current.embedding_dimension),
        };
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "INSERT INTO ai_config (id, provider, api_key, model, base_url, rag_mode, embedding_provider, embedding_api_key, embedding_model, embedding_endpoint, embedding_dimension)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
               provider = excluded.provider,
               api_key = excluded.api_key,
               model = excluded.model,
               base_url = excluded.base_url,
               rag_mode = excluded.rag_mode,
               embedding_provider = excluded.embedding_provider,
               embedding_api_key = excluded.embedding_api_key,
               embedding_model = excluded.embedding_model,
               embedding_endpoint = excluded.embedding_endpoint,
               embedding_dimension = excluded.embedding_dimension",
            params![
                updated.id,
                updated.provider,
                updated.api_key,
                updated.model,
                updated.base_url,
                updated.rag_mode,
                updated.embedding_provider,
                updated.embedding_api_key,
                updated.embedding_model,
                updated.embedding_endpoint,
                updated.embedding_dimension
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(updated)
    }

    // ===== RAG 分块操作 =====

    /// 替换某份简历的所有 RAG chunks
    ///
    /// 用事务包裹 DELETE + INSERT 保证原子性：
    /// 如果中途失败，不会出现"删了旧的但没插入新的"的状态。
    /// embedding 为 None 时 BLOB 字段存 NULL，检索时自动降级 BM25。
    pub fn replace_rag_chunks(&self, resume_id: &str, chunks: &[RagChunk]) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|err| err.to_string())?;
        let tx = conn.transaction().map_err(|err| err.to_string())?;
        tx.execute(
            "DELETE FROM rag_chunks WHERE resume_id = ?1",
            params![resume_id],
        )
        .map_err(|err| err.to_string())?;
        for chunk in chunks {
            tx.execute(
                "INSERT INTO rag_chunks (id, resume_id, resume_version, content_hash, chunk_index, chunk_type, section_title, chunk_text, embedding_provider, embedding_model, embedding_dim, embedding, embedding_created_at, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                params![
                    chunk.id,
                    chunk.resume_id,
                    chunk.resume_version,
                    chunk.content_hash,
                    chunk.chunk_index,
                    chunk.chunk_type,
                    chunk.section_title,
                    chunk.chunk_text,
                    chunk.embedding_provider,
                    chunk.embedding_model,
                    chunk.embedding_dim,
                    chunk.embedding.as_ref().map(|values| floats_to_blob(values)),
                    chunk.embedding.as_ref().map(|_| now()),
                    now(),
                    now(),
                ],
            )
            .map_err(|err| err.to_string())?;
        }
        tx.commit().map_err(|err| err.to_string())
    }

    /// 获取某份简历的所有 RAG chunks（按 chunk_index 排序）
    /// BLOB → Vec<f32> 通过 blob_to_floats 反序列化
    pub fn get_rag_chunks(&self, resume_id: &str) -> Result<Vec<RagChunk>, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, resume_id, resume_version, content_hash, chunk_index, chunk_type, section_title, chunk_text, embedding_provider, embedding_model, embedding_dim, embedding
             FROM rag_chunks WHERE resume_id = ?1 ORDER BY chunk_index ASC",
        ).map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![resume_id], |row| {
                Ok(RagChunk {
                    id: row.get(0)?,
                    resume_id: row.get(1)?,
                    resume_version: row.get(2)?,
                    content_hash: row.get(3)?,
                    chunk_index: row.get(4)?,
                    chunk_type: row.get(5)?,
                    section_title: row.get(6)?,
                    chunk_text: row.get(7)?,
                    embedding_provider: row.get(8)?,
                    embedding_model: row.get(9)?,
                    embedding_dim: row.get(10)?,
                    embedding: blob_to_floats(row.get(11)?),
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    }

    pub fn delete_rag_chunks(&self, resume_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "DELETE FROM rag_chunks WHERE resume_id = ?1",
            params![resume_id],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_database() -> (Database, std::path::PathBuf) {
        let path =
            std::env::temp_dir().join(format!("ai-job-assistant-status-test-{}", Uuid::new_v4()));
        let database = Database::new(&path).expect("create test database");
        (database, path)
    }

    fn custom_status_input(name: &str) -> ApplicationStatusInput {
        ApplicationStatusInput {
            name: name.to_string(),
            description: "用于测试的自定义投递状态".to_string(),
            color: "purple".to_string(),
            requires_interview_schedule: true,
        }
    }

    #[test]
    fn custom_status_can_be_created_updated_and_deleted() {
        let (database, path) = test_database();
        assert_eq!(database.get_application_statuses().unwrap().len(), 9);

        let created = database
            .create_application_status(custom_status_input("笔试"))
            .unwrap();
        assert!(!created.is_system);
        assert_eq!(created.color, "purple");
        assert!(created.requires_interview_schedule);

        let updated = database
            .update_application_status(
                &created.id,
                ApplicationStatusInput {
                    name: "线上笔试".to_string(),
                    description: "等待完成线上笔试".to_string(),
                    color: "cyan".to_string(),
                    requires_interview_schedule: false,
                },
            )
            .unwrap()
            .unwrap();
        assert_eq!(updated.name, "线上笔试");
        assert_eq!(updated.color, "cyan");
        assert!(!updated.requires_interview_schedule);

        database.delete_application_status(&created.id).unwrap();
        assert_eq!(database.get_application_statuses().unwrap().len(), 9);
        drop(database);
        let _ = std::fs::remove_dir_all(path);
    }

    #[test]
    fn status_in_use_cannot_be_deleted() {
        let (database, path) = test_database();
        let status = database
            .create_application_status(custom_status_input("背调中"))
            .unwrap();
        let resume = database
            .create_resume(ResumeInput {
                title: "测试简历".to_string(),
                content: "测试内容".to_string(),
                original_content: "测试内容".to_string(),
                source_type: Some("manual".to_string()),
            })
            .unwrap();
        database
            .create_application(ApplicationInput {
                company_name: "测试公司".to_string(),
                job_title: "测试职位".to_string(),
                job_description: String::new(),
                company_info: String::new(),
                resume_id: resume.id,
                status: Some(status.id.clone()),
                notes: None,
            })
            .unwrap();

        let error = database.delete_application_status(&status.id).unwrap_err();
        assert!(error.contains("正在被投递记录使用"));
        drop(database);
        let _ = std::fs::remove_dir_all(path);
    }
}
