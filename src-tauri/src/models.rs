// 数据模型 —— 前后端类型映射的桥梁
//
// 所有结构体通过 #[serde(rename_all = "camelCase")] 将 Rust 的
// snake_case 字段名自动转换为前端的 camelCase（如 updated_at → updatedAt）。
// 这保证了 Tauri IPC 序列化/反序列化时前后端类型一致。
//
// 设计约定：
//   - *Input 结构体：前端创建请求的字段（必填字段不含 Option）
//   - *Update 结构体：前端更新请求的字段（所有字段都是 Option，只传变更项）
//   - AnalyzeRequest：RAG 检索 + AI 分析的入参
//   - RagMatchResult：RAG 检索结果，通过 IPC 返回前端
//
// RagChunk 没有 #[serde(rename_all)] —— 它只在 Rust 内部使用（SQLite ↔ 内存），
// 不通过 IPC 序列化给前端，所以不需要 camelCase 转换。

use serde::{Deserialize, Serialize};

// ===== 简历 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resume {
    pub id: String,
    pub title: String,
    pub content: String,
    pub original_content: String,
    pub source_type: Option<String>,
    pub version: i64, // 每次修改 +1，用于 RAG 索引增量判断
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeInput {
    pub title: String,
    pub content: String,
    pub original_content: String,
    pub source_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeUpdate {
    pub title: Option<String>,
    pub content: Option<String>,
}

// ===== 投递记录 =====

/// 面试安排，以 JSON 形式存储在 applications.interviews 列中
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InterviewSchedule {
    pub interview_at: String,
    pub mode: String, // online | offline
    pub location: String,
    pub interviewer: Option<String>,
    pub calendar_reminder_status: Option<String>, // none | created | failed
    pub updated_at: String,
    /// 提前1天提醒是否已发送
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reminder_sent_1d: Option<bool>,
    /// 提前3小时提醒是否已发送
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reminder_sent_3h: Option<bool>,
}

pub type InterviewSchedules = std::collections::HashMap<String, InterviewSchedule>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Application {
    pub id: String,
    pub company_name: String,
    pub job_title: String,
    pub job_description: String,
    pub company_info: String,
    pub resume_id: String,
    pub status: String, // applied | technical | hr | boss | offer | rejected | withdrawn
    pub interviews: Option<InterviewSchedules>,
    pub notes: String,
    pub applied_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationInput {
    pub company_name: String,
    pub job_title: String,
    pub job_description: String,
    pub company_info: String,
    pub resume_id: String,
    pub status: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationUpdate {
    pub company_name: Option<String>,
    pub job_title: Option<String>,
    pub job_description: Option<String>,
    pub company_info: Option<String>,
    pub resume_id: Option<String>,
    pub status: Option<String>,
    pub interviews: Option<InterviewSchedules>,
    pub notes: Option<String>,
}

// ===== AI 配置 =====
//
// embedding_dimension 是 Option<i64>：留空则使用模型默认维度（如 text-embedding-v4 的 1024）。
// AiConfigUpdate 中所有字段都是 Option，支持增量更新。

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub id: String,
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub base_url: String,
    pub rag_mode: String,              // auto | embedding | keyword
    pub embedding_provider: String,
    pub embedding_api_key: String,
    pub embedding_model: String,
    pub embedding_endpoint: String,
    pub embedding_dimension: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigUpdate {
    pub id: Option<String>,
    pub provider: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub rag_mode: Option<String>,
    pub embedding_provider: Option<String>,
    pub embedding_api_key: Option<String>,
    pub embedding_model: Option<String>,
    pub embedding_endpoint: Option<String>,
    pub embedding_dimension: Option<i64>,
}

// ===== RAG 检索 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeRequest {
    pub resume_id: Option<String>,
    pub resume_content: String,
    pub company_name: String,
    pub job_title: String,
    pub job_description: String,
    pub company_info: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagDimensionScore {
    pub dimension: String,
    pub score: i64,
    pub weight: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagChunkMatch {
    pub chunk_id: String,
    pub chunk_type: String,
    pub section_title: String,
    pub text: String,
    pub score: i64,
}

/// RAG 检索结果 —— 这是前后端约定的核心数据结构
///
/// retrieval_mode 标识本次检索使用的方式：
///   "embedding" → 语义向量余弦相似度
///   "keyword"   → BM25 关键词匹配（降级或用户选择）
///
/// warning 字段在降级场景下告知前端展示提示。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagMatchResult {
    pub overall_score: i64,
    pub retrieval_mode: String,
    pub dimension_scores: Vec<RagDimensionScore>,
    pub top_chunks: Vec<RagChunkMatch>,
    pub warning: Option<String>,
}

// ===== RAG 分块（内部使用，不通过 IPC 序列化） =====
//
// embedding 字段是 Option<Vec<f32>>：
//   - Some(...) → 已调用 embedding API 生成了向量
//   - None → 未配置 API 或调用失败，检索时降级 BM25
//
// content_hash 用于增量索引判断：内容没变就跳过重建。
// embedding_created_at 只存在于 SQLite 表，内存中的 RagChunk 用 embedding 的 Some/None 即可。

#[derive(Debug, Clone)]
pub struct RagChunk {
    pub id: String,
    pub resume_id: String,
    pub resume_version: i64,
    pub content_hash: String,
    pub chunk_index: i64,
    pub chunk_type: String,
    pub section_title: String,
    pub chunk_text: String,
    pub embedding_provider: Option<String>,
    pub embedding_model: Option<String>,
    pub embedding_dim: Option<i64>,
    pub embedding: Option<Vec<f32>>,
}
