// Rust 端 RAG（检索增强生成）引擎
//
// 这是桌面端的完整 RAG 实现，对应浏览器端的 src/utils/rag.ts。
// 两者的分块策略、BM25 公式、维度权重完全同构，保证跨平台行为一致。
//
// 桌面端独有的能力：
//   1. 持久化索引（SQLite 存储 chunks + embedding 向量）
//   2. 语义向量搜索（调用阿里云百炼 embedding API → 余弦相似度）
//   3. 自动降级（embedding 失败 → BM25 keyword match）
//   4. 增量索引（content_hash + version 判断是否需要重建）
//
// 模块结构：
//   index_resume()      —— 离线：建索引（分块 + embedding）
//   match_resume_job()  —— 在线：检索（embedding 优先 → BM25 降级）
//   keyword_match()     —— BM25 关键词匹配（永远可用的底盘）
//   aliyun_embed()      —— 调用阿里云百炼 embedding API

use crate::db::Database;
use crate::models::{
    AiConfig, AnalyzeRequest, RagChunk, RagChunkMatch, RagDimensionScore, RagMatchResult,
};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

/// 维度权重常量
///
/// 与 TypeScript 端 DIMENSION_WEIGHTS 完全一致：
///   经验 30% > 项目 25% = 技能 25% > 总结 15% > 教育 5%
const DIMENSIONS: [(&str, &str, f32); 5] = [
    ("experience", "工作经历", 0.30),
    ("project", "项目经验", 0.25),
    ("skills", "专业技能", 0.25),
    ("summary", "个人优势", 0.15),
    ("education", "教育背景", 0.05),
];

/// 内容哈希 —— 用于增量索引判断
///
/// SHA-256 对简历内容做摘要，存储在 rag_chunks.content_hash 中。
/// 检索时对比当前内容哈希 vs 已存储哈希，不同即需要重建索引。
fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// 根据标题关键词推断分块类型
///
/// 纯规则匹配，与 TS 端 inferChunkType 逻辑完全一致。
/// 不使用 AI 分类，保证确定性和跨平台一致性。
fn infer_chunk_type(title: &str) -> String {
    if title.contains("项目") || title.contains("作品") {
        "project".to_string()
    } else if title.contains("工作") || title.contains("经历") || title.contains("任职") {
        "experience".to_string()
    } else if title.contains("技能") || title.contains("技术") || title.contains("专业") {
        "skills".to_string()
    } else if title.contains("优势")
        || title.contains("总结")
        || title.contains("简介")
        || title.contains("自我")
    {
        "summary".to_string()
    } else if title.contains("教育") || title.contains("学历") || title.contains("学校") {
        "education".to_string()
    } else if title.contains("求职") || title.contains("意向") {
        "intent".to_string()
    } else {
        "other".to_string()
    }
}

/// 长段落二次拆分（与 TS 端逻辑一致，1200 字符阈值）
fn split_long_section(section: &str) -> Vec<String> {
    if section.chars().count() <= 1200 {
        return vec![section.trim().to_string()];
    }

    let mut result = Vec::new();
    let mut current = String::new();
    for part in section
        .split("\n\n")
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        if !current.is_empty() && current.chars().count() + part.chars().count() > 1200 {
            result.push(current.trim().to_string());
            current.clear();
        }
        if !current.is_empty() {
            current.push_str("\n\n");
        }
        current.push_str(part);
    }
    if !current.trim().is_empty() {
        result.push(current.trim().to_string());
    }
    if result.is_empty() {
        result.push(section.trim().to_string());
    }
    result
}

/// 简历分块函数
///
/// 切分策略（与 TS 端完全一致）：
///   1. 按 ## 标题行切分
///   2. 每个块推断类型
///   3. 超过 1200 字符的块按段落二次拆分
///   4. UUID v4 作为 chunk ID（与 TS 端的 "blockIndex-partIndex" 风格不同，但功能等价）
fn chunk_resume(resume_id: &str, version: i64, content: &str) -> Vec<RagChunk> {
    let normalized = content.replace("\r\n", "\n");
    let hash = content_hash(&normalized);
    let mut sections = Vec::new();
    let mut current = String::new();

    for line in normalized.lines() {
        if line.starts_with("## ") && !current.trim().is_empty() {
            sections.push(current.trim().to_string());
            current.clear();
        }
        current.push_str(line);
        current.push('\n');
    }
    if !current.trim().is_empty() {
        sections.push(current.trim().to_string());
    }
    if sections.is_empty() {
        sections.push(normalized);
    }

    let mut chunks = Vec::new();
    for (section_index, section) in sections.iter().enumerate() {
        let title = section
            .lines()
            .find(|line| line.starts_with("## "))
            .map(|line| line.trim_start_matches('#').trim().to_string())
            .unwrap_or_else(|| {
                if section_index == 0 {
                    "基本信息".to_string()
                } else {
                    "其他".to_string()
                }
            });
        let chunk_type = infer_chunk_type(&title);
        for part in split_long_section(section) {
            let chunk_index = chunks.len() as i64;
            chunks.push(RagChunk {
                id: Uuid::new_v4().to_string(),
                resume_id: resume_id.to_string(),
                resume_version: version,
                content_hash: hash.clone(),
                chunk_index,
                chunk_type: chunk_type.clone(),
                section_title: title.clone(),
                chunk_text: part,
                embedding_provider: None, // 待 embedding API 调用后填充
                embedding_model: None,
                embedding_dim: None,
                embedding: None,
            });
        }
    }
    chunks
}

// ===== CJK 感知分词器 =====

/// CJK 感知分词（与 TS 端 tokenize 逻辑完全同构）
///
/// 分词策略：
///   1. 遍历字符，区分 CJK / ASCII alphanumeric / 分隔符
///   2. 连续的同类型字符归为一个 token
///   3. CJK token 长度 > 2 时，额外生成所有相邻二字对（bigram）
///   4. 过滤掉长度 ≤ 1 的 token
///
/// 例如 "前端工程师" → ["前端工程师", "前端", "端工", "工程", "程师"]
fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut current_is_cjk = false;

    for ch in text.to_lowercase().chars() {
        let is_cjk = ('\u{4e00}'..='\u{9fff}').contains(&ch);
        let is_word = ch.is_ascii_alphanumeric() || matches!(ch, '+' | '#' | '.' | '-');
        if is_cjk || is_word {
            if !current.is_empty() && current_is_cjk != is_cjk {
                push_token(&mut tokens, &current, current_is_cjk);
                current.clear();
            }
            current_is_cjk = is_cjk;
            current.push(ch);
        } else if !current.is_empty() {
            push_token(&mut tokens, &current, current_is_cjk);
            current.clear();
        }
    }
    if !current.is_empty() {
        push_token(&mut tokens, &current, current_is_cjk);
    }
    tokens
        .into_iter()
        .filter(|token| token.chars().count() > 1)
        .collect()
}

/// 将 token 送入列表，对 CJK token 追加 bigram 子词
fn push_token(tokens: &mut Vec<String>, token: &str, is_cjk: bool) {
    tokens.push(token.to_string());
    if is_cjk && token.chars().count() > 2 {
        let chars: Vec<char> = token.chars().collect();
        for pair in chars.windows(2) {
            tokens.push(pair.iter().collect());
        }
    }
}

// ===== BM25 算法实现 =====

/// BM25 评分（与 TS 端 bm25Score 完全同构）
///
/// 公式：BM25 = Σ IDF(qi) × TF_saturated(qi, D)
///   IDF = ln(1 + (N - df + 0.5) / (df + 0.5))
///   TF_saturated = (tf × (k1 + 1)) / (tf + k1 × (1 - b + b × docLen / avgLen))
///
/// 参数：k1=1.5（词频饱和），b=0.75（长度归一化强度）
fn bm25_score(query_tokens: &[String], chunk_tokens: &[String], all_tokens: &[Vec<String>]) -> f32 {
    if query_tokens.is_empty() || chunk_tokens.is_empty() {
        return 0.0;
    }
    let k1 = 1.5;
    let b = 0.75;
    let avg_len = all_tokens
        .iter()
        .map(|tokens| tokens.len() as f32)
        .sum::<f32>()
        / all_tokens.len().max(1) as f32;
    let mut counts = HashMap::<&String, i32>::new();
    for token in chunk_tokens {
        *counts.entry(token).or_insert(0) += 1;
    }

    let unique_query: HashSet<&String> = query_tokens.iter().collect();
    unique_query.into_iter().fold(0.0, |score, term| {
        let tf = *counts.get(term).unwrap_or(&0) as f32;
        if tf <= 0.0 {
            return score;
        }
        let docs_with_term = all_tokens
            .iter()
            .filter(|tokens| tokens.contains(term))
            .count() as f32;
        let idf =
            (1.0 + (all_tokens.len() as f32 - docs_with_term + 0.5) / (docs_with_term + 0.5)).ln();
        let denominator = tf + k1 * (1.0 - b + b * (chunk_tokens.len() as f32 / avg_len.max(1.0)));
        score + idf * ((tf * (k1 + 1.0)) / denominator)
    })
}

/// BM25 分数归一化为 [0, 100]（饱和函数 score/(score+4)*100）
fn normalize_keyword_score(score: f32) -> i64 {
    ((score / (score + 4.0)) * 100.0).clamp(0.0, 100.0).round() as i64
}

// ===== 语义向量搜索 =====

/// 余弦相似度
///
/// 公式：cos(a, b) = (a·b) / (|a| × |b|)
/// 结果范围 [-1, 1]：
///   1  = 完全相同方向
///   0  = 正交（无关）
///   -1 = 完全相反
///
/// 实际场景中 embedding 向量几乎不会出现负相似度，
/// 所以 embedding_score 直接把 [-1, 1] 映射到 [0, 100]。
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot = a
        .iter()
        .zip(b)
        .map(|(left, right)| left * right)
        .sum::<f32>();
    let norm_a = a.iter().map(|value| value * value).sum::<f32>().sqrt();
    let norm_b = b.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm_a < 1e-8 || norm_b < 1e-8 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

/// 余弦相似度 → [0, 100] 分数
///
/// (score + 1) / 2 × 100 将 [-1, 1] 线性映射到 [0, 100]
fn embedding_score(score: f32) -> i64 {
    (((score + 1.0) / 2.0) * 100.0).clamp(0.0, 100.0).round() as i64
}

/// 构建维度分数（取每个维度 top-2 chunks 的平均分）
fn dimension_scores(matches: &[RagChunkMatch]) -> Vec<RagDimensionScore> {
    DIMENSIONS
        .iter()
        .map(|(chunk_type, label, weight)| {
            let relevant: Vec<&RagChunkMatch> = matches
                .iter()
                .filter(|item| item.chunk_type == *chunk_type)
                .take(2)
                .collect();
            let score = if relevant.is_empty() {
                0
            } else {
                (relevant.iter().map(|item| item.score).sum::<i64>() as f32 / relevant.len() as f32)
                    .round() as i64
            };
            RagDimensionScore {
                dimension: label.to_string(),
                score,
                weight: *weight,
            }
        })
        .collect()
}

/// 维度加权总分
fn overall_score(scores: &[RagDimensionScore]) -> i64 {
    let total_weight = scores.iter().map(|item| item.weight).sum::<f32>().max(1.0);
    let weighted = scores
        .iter()
        .map(|item| item.score as f32 * item.weight)
        .sum::<f32>();
    (weighted / total_weight).round() as i64
}

/// BM25 关键词匹配 —— RAG 系统的兜底方案
///
/// 返回 retrieval_mode: "keyword"，始终带 warning 提示。
/// 与 TS 端 matchResumeWithKeywordRag 完全同构。
fn keyword_match(
    request: &AnalyzeRequest,
    chunks: &[RagChunk],
    warning: Option<String>,
) -> RagMatchResult {
    // 拼接查询字符串（与 TS 端一致）
    let query = format!(
        "{}\n{}\n{}\n{}",
        request.company_name, request.job_title, request.job_description, request.company_info
    );
    let query_tokens = tokenize(&query);
    let all_tokens: Vec<Vec<String>> = chunks
        .iter()
        .map(|chunk| tokenize(&chunk.chunk_text))
        .collect();
    let mut scored: Vec<(usize, f32)> = all_tokens
        .iter()
        .enumerate()
        .map(|(index, tokens)| (index, bm25_score(&query_tokens, tokens, &all_tokens)))
        .filter(|(_, score)| *score > 0.0)
        .collect();
    scored.sort_by(|left, right| {
        right
            .1
            .partial_cmp(&left.1)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let top_chunks: Vec<RagChunkMatch> = scored
        .into_iter()
        .take(5)
        .map(|(index, score)| {
            let chunk = &chunks[index];
            RagChunkMatch {
                chunk_id: chunk.id.clone(),
                chunk_type: chunk.chunk_type.clone(),
                section_title: chunk.section_title.clone(),
                text: chunk.chunk_text.clone(),
                score: normalize_keyword_score(score),
            }
        })
        .collect();
    let dimension_scores = dimension_scores(&top_chunks);
    RagMatchResult {
        overall_score: overall_score(&dimension_scores),
        retrieval_mode: "keyword".to_string(),
        dimension_scores,
        top_chunks,
        warning,
    }
}

// ===== Embedding API 调用 =====

/// 调用阿里云百炼 text-embedding API
///
/// API 格式：
///   POST {endpoint}
///   Body: { "model": "...", "input": { "texts": [...] }, "parameters": { "dimension": 1024 } }
///   Response: { "output": { "embeddings": [{ "embedding": [...] }, ...] } }
///
/// 兼容多种返回格式（/output/embeddings 和 /data 两种路径都尝试）。
/// 维度参数可选：不设置则使用模型默认维度（text-embedding-v4 为 1024）。
async fn aliyun_embed(texts: &[String], config: &AiConfig) -> Result<Vec<Vec<f32>>, String> {
    if config.embedding_api_key.trim().is_empty() {
        return Err("未配置 Embedding API Key".to_string());
    }
    let mut body = serde_json::json!({
        "model": config.embedding_model,
        "input": {
            "texts": texts
        }
    });
    if let Some(dimension) = config.embedding_dimension {
        body["parameters"] = serde_json::json!({ "dimension": dimension });
    }

    let response = reqwest::Client::new()
        .post(&config.embedding_endpoint)
        .bearer_auth(&config.embedding_api_key)
        .json(&body)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let status = response.status();
    let value: serde_json::Value = response.json().await.map_err(|err| err.to_string())?;
    if !status.is_success() {
        return Err(value.to_string());
    }

    // 兼容多种返回格式
    let arrays = value
        .pointer("/output/embeddings")
        .or_else(|| value.pointer("/data"))
        .and_then(|item| item.as_array())
        .ok_or_else(|| "Embedding 返回格式无法识别".to_string())?;

    arrays
        .iter()
        .map(|item| {
            let embedding = item
                .get("embedding")
                .and_then(|value| value.as_array())
                .ok_or_else(|| "Embedding 向量为空".to_string())?;
            embedding
                .iter()
                .map(|value| {
                    value
                        .as_f64()
                        .map(|number| number as f32)
                        .ok_or_else(|| "Embedding 向量包含非数字".to_string())
                })
                .collect::<Result<Vec<f32>, String>>()
        })
        .collect()
}

/// 为 chunks 批量生成 embedding 向量
///
/// 如果 rag_mode == "keyword"，直接跳过（不做无意义的 API 调用）。
/// 调用成功后将向量写入 chunk.embedding 字段，
/// 后续 replace_rag_chunks 会将向量序列化为 BLOB 存入 SQLite。
async fn embed_documents(chunks: &mut [RagChunk], config: &AiConfig) -> Result<(), String> {
    if config.rag_mode == "keyword" {
        return Ok(());
    }
    let texts: Vec<String> = chunks
        .iter()
        .map(|chunk| chunk.chunk_text.clone())
        .collect();
    let embeddings = aliyun_embed(&texts, config).await?;
    for (chunk, embedding) in chunks.iter_mut().zip(embeddings) {
        chunk.embedding_provider = Some(config.embedding_provider.clone());
        chunk.embedding_model = Some(config.embedding_model.clone());
        chunk.embedding_dim = Some(embedding.len() as i64);
        chunk.embedding = Some(embedding);
    }
    Ok(())
}

// ===== 公开 API =====

/// 简历索引（离线阶段）
///
/// 调用时机：简历保存/更新后（由 Store 层 fire-and-forget 触发）
///
/// 流程：
///   1. 读取简历全文
///   2. 分块
///   3. 如果 rag_mode != "keyword"，调用 embedding API
///      - rag_mode == "auto"    → API 失败静默跳过（chunks 无向量）
///      - rag_mode == "embedding" → API 失败返回错误
///   4. 存入 SQLite（replace_rag_chunks 用事务保证原子性）
pub async fn index_resume(db: &Database, resume_id: &str) -> Result<(), String> {
    let resume = db
        .get_resume(resume_id)?
        .ok_or_else(|| "简历不存在".to_string())?;
    let config = db.get_ai_config()?;
    let mut chunks = chunk_resume(&resume.id, resume.version, &resume.content);

    if config.rag_mode != "keyword" {
        if let Err(err) = embed_documents(&mut chunks, &config).await {
            if config.rag_mode == "embedding" {
                return Err(err); // 严格模式：必须成功
            }
            // auto 模式：静默跳过，chunks 保持 embedding: None
        }
    }

    db.replace_rag_chunks(resume_id, &chunks)
}

/// 判断是否需要重建索引
///
/// 触发条件（任一满足即重建）：
///   1. chunks 为空（从未建立索引）
///   2. content_hash 或 resume_version 不一致（内容已修改）
///   3. rag_mode != "keyword" 且 API Key 已配置，但 chunks 缺少 embedding
///      （之前因 API 失败没生成向量，现在可能配置好了）
fn needs_reindex(
    chunks: &[RagChunk],
    content_hash: &str,
    resume_version: i64,
    config: &AiConfig,
) -> bool {
    if chunks.is_empty() {
        return true;
    }
    if chunks
        .iter()
        .any(|chunk| chunk.content_hash != content_hash || chunk.resume_version != resume_version)
    {
        return true;
    }
    // embedding 可用但 chunks 缺少向量 → 需要补建
    if config.rag_mode != "keyword" && !config.embedding_api_key.trim().is_empty() {
        return chunks.iter().any(|chunk| {
            chunk.embedding_model.as_deref() != Some(config.embedding_model.as_str())
                || chunk.embedding.is_none()
        });
    }
    false
}

/// RAG 匹配：简历 vs JD（在线阶段）
///
/// 这是前端 db.rag.matchResumeJob() 在桌面端的实现。
///
/// 决策树：
///   rag_mode == "keyword" 或 embedding_api_key 为空
///     → 直接走 BM25 keyword_match()
///
///   rag_mode != "keyword" 且有 embedding_api_key
///     → 调 aliyun_embed(查询)
///       ├── 成功 → 余弦相似度匹配 → 返回 "embedding" 结果
///       └── 失败
///           ├── rag_mode == "embedding" → 返回错误
///           └── rag_mode == "auto" → 降级 keyword_match()
pub async fn match_resume_job(
    db: &Database,
    request: AnalyzeRequest,
) -> Result<RagMatchResult, String> {
    // 通过 resume_id 或内容匹配找到简历
    let resume = if let Some(resume_id) = request.resume_id.as_deref() {
        db.get_resume(resume_id)?
            .ok_or_else(|| "简历不存在，请先保存简历后再分析".to_string())?
    } else {
        db.get_resumes()?
            .into_iter()
            .find(|item| item.content == request.resume_content)
            .ok_or_else(|| "未找到匹配的简历，请先保存简历后再分析".to_string())?
    };
    let config = db.get_ai_config()?;
    let hash = content_hash(&resume.content);
    let existing = db.get_rag_chunks(&resume.id)?;

    // 增量索引：如果需要则重建
    if needs_reindex(&existing, &hash, resume.version, &config) {
        index_resume(db, &resume.id).await?;
    }
    let chunks = db.get_rag_chunks(&resume.id)?;

    // ===== 语义向量搜索（优先） =====
    if config.rag_mode != "keyword" && !config.embedding_api_key.trim().is_empty() {
        let query = format!(
            "{}\n{}\n{}\n{}",
            request.company_name, request.job_title, request.job_description, request.company_info
        );
        match aliyun_embed(&[query], &config).await {
            Ok(mut embeddings) => {
                if let Some(query_embedding) = embeddings.pop() {
                    // 计算每个 chunk 与查询向量的余弦相似度
                    let mut matches: Vec<RagChunkMatch> = chunks
                        .iter()
                        .filter_map(|chunk| {
                            chunk.embedding.as_ref().map(|embedding| RagChunkMatch {
                                chunk_id: chunk.id.clone(),
                                chunk_type: chunk.chunk_type.clone(),
                                section_title: chunk.section_title.clone(),
                                text: chunk.chunk_text.clone(),
                                score: embedding_score(cosine_similarity(
                                    &query_embedding,
                                    embedding,
                                )),
                            })
                        })
                        .collect();
                    matches.sort_by(|left, right| right.score.cmp(&left.score));
                    matches.truncate(5);
                    let dimension_scores = dimension_scores(&matches);
                    return Ok(RagMatchResult {
                        overall_score: overall_score(&dimension_scores),
                        retrieval_mode: "embedding".to_string(), // 成功标记
                        dimension_scores,
                        top_chunks: matches,
                        warning: None, // 语义搜索成功，无警告
                    });
                }
            }
            Err(err) if config.rag_mode == "embedding" => return Err(err), // 严格模式：失败即报错
            Err(_) => {} // auto 模式：降级到 keyword_match
        }
    }

    // ===== BM25 关键词匹配（降级/默认） =====
    Ok(keyword_match(
        &request,
        &chunks,
        Some("语义匹配暂不可用，已自动使用本地关键词匹配。".to_string()),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_resume_detects_sections() {
        let chunks = chunk_resume(
            "r1",
            1,
            "## 专业技能\nVue TypeScript\n\n## 项目经历\n低代码平台",
        );
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].chunk_type, "skills");
        assert_eq!(chunks[1].chunk_type, "project");
    }

    #[test]
    fn keyword_match_finds_relevant_chunk() {
        let chunks = chunk_resume(
            "r1",
            1,
            "## 专业技能\nVue TypeScript Vite\n\n## 教育背景\n本科",
        );
        let result = keyword_match(
            &AnalyzeRequest {
                resume_id: None,
                resume_content: String::new(),
                company_name: "测试公司".to_string(),
                job_title: "前端工程师".to_string(),
                job_description: "需要 Vue 和 TypeScript 经验".to_string(),
                company_info: String::new(),
            },
            &chunks,
            None,
        );
        assert_eq!(result.retrieval_mode, "keyword");
        assert_eq!(result.top_chunks[0].chunk_type, "skills");
    }
}
