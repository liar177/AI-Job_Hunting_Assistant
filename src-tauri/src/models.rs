use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resume {
    pub id: String,
    pub title: String,
    pub content: String,
    pub original_content: String,
    pub source_type: Option<String>,
    pub version: i64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Application {
    pub id: String,
    pub company_name: String,
    pub job_title: String,
    pub job_description: String,
    pub company_info: String,
    pub resume_id: String,
    pub status: String,
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
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub id: String,
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub base_url: String,
    pub rag_mode: String,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagMatchResult {
    pub overall_score: i64,
    pub retrieval_mode: String,
    pub dimension_scores: Vec<RagDimensionScore>,
    pub top_chunks: Vec<RagChunkMatch>,
    pub warning: Option<String>,
}

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
