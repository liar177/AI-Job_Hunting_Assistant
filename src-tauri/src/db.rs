use crate::models::{
    AiConfig, AiConfigUpdate, Application, ApplicationInput, ApplicationUpdate, RagChunk, Resume,
    ResumeInput, ResumeUpdate,
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

fn floats_to_blob(values: &[f32]) -> Vec<u8> {
    values
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect::<Vec<u8>>()
}

fn blob_to_floats(blob: Option<Vec<u8>>) -> Option<Vec<f32>> {
    blob.map(|bytes| {
        bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect()
    })
}

impl Database {
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
              notes TEXT DEFAULT '',
              applied_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (resume_id) REFERENCES resumes(id)
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
            CREATE INDEX IF NOT EXISTS idx_rag_chunks_resume_id ON rag_chunks(resume_id);
            CREATE INDEX IF NOT EXISTS idx_rag_chunks_resume_version ON rag_chunks(resume_id, resume_version);
            CREATE INDEX IF NOT EXISTS idx_rag_chunks_hash ON rag_chunks(resume_id, content_hash);
            "#,
        )
        .map_err(|err| err.to_string())?;
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
        .optional()
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

    pub fn update_resume(&self, id: &str, data: ResumeUpdate) -> Result<Option<Resume>, String> {
        let current = match self.get_resume(id)? {
            Some(resume) => resume,
            None => return Ok(None),
        };
        let updated = Resume {
            title: data.title.unwrap_or(current.title),
            content: data.content.unwrap_or(current.content),
            version: current.version + 1,
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

    pub fn delete_resume(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM resumes WHERE id = ?1", params![id])
            .map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM rag_chunks WHERE resume_id = ?1", params![id])
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn get_applications(&self) -> Result<Vec<Application>, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, company_name, job_title, job_description, company_info, resume_id, status, notes, applied_at, updated_at
             FROM applications ORDER BY datetime(updated_at) DESC",
        ).map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(Application {
                    id: row.get(0)?,
                    company_name: row.get(1)?,
                    job_title: row.get(2)?,
                    job_description: row.get(3)?,
                    company_info: row.get(4)?,
                    resume_id: row.get(5)?,
                    status: row.get(6)?,
                    notes: row.get(7)?,
                    applied_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    }

    pub fn get_application(&self, id: &str) -> Result<Option<Application>, String> {
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.query_row(
            "SELECT id, company_name, job_title, job_description, company_info, resume_id, status, notes, applied_at, updated_at
             FROM applications WHERE id = ?1",
            params![id],
            |row| {
                Ok(Application {
                    id: row.get(0)?,
                    company_name: row.get(1)?,
                    job_title: row.get(2)?,
                    job_description: row.get(3)?,
                    company_info: row.get(4)?,
                    resume_id: row.get(5)?,
                    status: row.get(6)?,
                    notes: row.get(7)?,
                    applied_at: row.get(8)?,
                    updated_at: row.get(9)?,
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
            status: "applied".to_string(),
            notes: data.notes.unwrap_or_default(),
            applied_at: now(),
            updated_at: now(),
        };
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "INSERT INTO applications (id, company_name, job_title, job_description, company_info, resume_id, status, notes, applied_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                application.id,
                application.company_name,
                application.job_title,
                application.job_description,
                application.company_info,
                application.resume_id,
                application.status,
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
        let updated = Application {
            company_name: data.company_name.unwrap_or(current.company_name),
            job_title: data.job_title.unwrap_or(current.job_title),
            job_description: data.job_description.unwrap_or(current.job_description),
            company_info: data.company_info.unwrap_or(current.company_info),
            resume_id: data.resume_id.unwrap_or(current.resume_id),
            status: data.status.unwrap_or(current.status),
            notes: data.notes.unwrap_or(current.notes),
            updated_at: now(),
            ..current
        };
        let conn = self.conn.lock().map_err(|err| err.to_string())?;
        conn.execute(
            "UPDATE applications
             SET company_name = ?1, job_title = ?2, job_description = ?3, company_info = ?4, resume_id = ?5, status = ?6, notes = ?7, updated_at = ?8
             WHERE id = ?9",
            params![
                updated.company_name,
                updated.job_title,
                updated.job_description,
                updated.company_info,
                updated.resume_id,
                updated.status,
                updated.notes,
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
