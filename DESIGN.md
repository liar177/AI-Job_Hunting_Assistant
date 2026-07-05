# 桌面应用 + RAG + 本地存储最终改造方案

## 0. 最终结论

本项目改造采用以下路线：

```text
Tauri v2 桌面壳
  + Vue 3 现有前端
  + Rust 作为唯一后端
  + SQLite 作为桌面端主存储
  + 阿里云百炼 text-embedding-v4 作为默认向量模型
  + BM25 作为离线/未配置/调用失败时的降级检索
```

核心取舍：

- **桌面端先做 Windows**，后续再补 macOS/Linux。
- **不引入 Python / Node.js 后台服务**，避免桌面打包、进程管理和运行时依赖变复杂。
- **前端现有 UI 和业务心智尽量不变**，通过数据访问适配层兼容 Tauri 与浏览器模式。
- **对话模型与 Embedding 模型分开配置**，因为二者用途、模型供应商、接口稳定性和成本都不同。
- **RAG 主路径使用 Embedding 语义检索**，默认阿里云百炼 `text-embedding-v4`；不可用时自动降级为本地 BM25。
- **浏览器模式继续保留 localStorage 降级**，桌面模式使用 SQLite。

---

## 1. 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│                      Tauri 桌面应用                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Vue 3 前端 WebView                    │  │
│  │                                                       │  │
│  │  - 现有页面基本保留                                    │  │
│  │  - Pinia Store 改为异步数据访问                         │  │
│  │  - 通过 invoke() 调用 Rust Commands                    │  │
│  │  - 浏览器模式保留 localStorage + BM25 降级              │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │ IPC                              │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │                    Rust 后端                            │  │
│  │                                                       │  │
│  │  - SQLite CRUD                                        │  │
│  │  - localStorage 到 SQLite 迁移                          │  │
│  │  - 简历分块                                            │  │
│  │  - 阿里云百炼 Embedding API 客户端                      │  │
│  │  - 向量相似度检索                                      │  │
│  │  - BM25 降级检索                                       │  │
│  │  - 匹配度评分                                          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

三块功能的关系：

| 能力 | 桌面应用 | 本地存储 | RAG |
| --- | --- | --- | --- |
| Tauri | 提供桌面壳和 Rust 运行时 | 提供 SQLite 落盘能力 | 提供本地 RAG 引擎运行位置 |
| SQLite | 存储应用数据 | 替代 localStorage | 存储 chunk、向量和索引元数据 |
| RAG | 通过 Rust command 暴露给前端 | 依赖 rag_chunks 表 | 为匹配度和优化依据提供证据 |

---

## 2. 功能一：Tauri 桌面应用

### 2.1 技术选型

- Tauri v2
- Rust 2021 edition
- Windows 优先，打包目标为 NSIS `.exe` 和 MSI `.msi`
- 前端继续使用现有 Vite + Vue 3 + Pinia + Tailwind + Element Plus

### 2.2 初始化方式

在现有项目中追加 Tauri：

```bash
npm install --save-dev @tauri-apps/cli
npm install @tauri-apps/api
npx tauri init
```

新增脚本：

```json
{
  "scripts": {
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

### 2.3 Tauri 配置

窗口建议：

```json
{
  "app": {
    "windows": [
      {
        "title": "AI求职助手",
        "width": 1400,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 700,
        "resizable": true,
        "fullscreen": false
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "icon": ["icons/icon.ico"]
  }
}
```

前端开发服务：

- Vite dev server 固定端口，Tauri dev 加载本地 devUrl。
- 生产打包加载 `dist`。
- 正式桌面包里建议关闭 `vite-plugin-trae-solo-badge`，避免桌面应用出现外部推广入口。

### 2.4 Rust Commands

第一版暴露以下命令：

```rust
// App
init_app()
get_app_info()

// Resume CRUD
get_resumes()
get_resume(id)
create_resume(data)
update_resume(id, data)
delete_resume(id)

// Application CRUD
get_applications()
get_application(id)
create_application(data)
update_application(id, data)
delete_application(id)

// AI Config
get_ai_config()
save_ai_config(config)
test_embedding_config(config)

// Migration
get_storage_status()
migrate_from_local_storage(payload)

// RAG
rag_index_resume(resume_id)
rag_delete_resume_index(resume_id)
rag_match_resume_job(request)
```

### 2.5 Windows 打包

```bash
npm run tauri:build
```

产物：

```text
src-tauri/target/release/bundle/nsis/
src-tauri/target/release/bundle/msi/
```

---

## 3. 功能三：本地数据存储改造

### 3.1 存储策略

```text
Tauri 桌面环境
  -> SQLite

普通浏览器环境
  -> localStorage
  -> RAG 使用 TypeScript BM25 降级
```

前端新增统一适配层：

```text
src/utils/platform.ts
src/utils/db-adapter.ts
src/utils/rag.ts
```

Store 层只依赖 adapter，不直接关心数据来自 SQLite 还是 localStorage。

### 3.2 AI 配置结构

对话模型与向量模型分开：

```typescript
export interface AIConfig {
  id: string

  provider: 'deepseek' | 'aliyun-bailian' | 'custom'
  apiKey: string
  model: string
  baseUrl: string

  ragMode: 'auto' | 'embedding' | 'keyword'
  embeddingProvider: 'aliyun-bailian' | 'openai-compatible' | 'custom'
  embeddingApiKey: string
  embeddingModel: string
  embeddingEndpoint: string
  embeddingDimension?: number
}
```

默认值：

```typescript
const DEFAULT_AI_CONFIG: AIConfig = {
  id: 'default',

  provider: 'deepseek',
  apiKey: '',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com/v1',

  ragMode: 'auto',
  embeddingProvider: 'aliyun-bailian',
  embeddingApiKey: '',
  embeddingModel: 'text-embedding-v4',
  embeddingEndpoint: 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
  embeddingDimension: undefined,
}
```

说明：

- 对话模型默认继续沿用当前项目逻辑，用户可自行配置。
- Embedding 默认使用阿里云百炼 `text-embedding-v4`。
- `embeddingEndpoint` 放在高级设置里，默认隐藏，但允许用户修改，避免接口域名或兼容模式变化时需要发版。
- `ragMode = auto` 时，如果 Embedding 配置缺失或调用失败，自动降级 BM25。

### 3.3 SQLite 表设计

```sql
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
```

`rag_chunks` 必须保存 `resume_version`、`content_hash`、`embedding_model` 和 `embedding_dim`，用于判断以下情况是否需要重建索引：

- 简历内容变更
- 简历版本变更
- Embedding 模型切换
- 向量维度变化

### 3.4 localStorage 到 SQLite 迁移

迁移只在 Tauri 环境执行：

```text
应用启动
  -> 前端检测 isTauri()
  -> 调用 get_storage_status()
  -> 如果 SQLite 为空且 localStorage 有旧数据
  -> 前端读取 STORAGE_KEYS
  -> 调用 migrate_from_local_storage(payload)
  -> Rust 写入 SQLite
  -> 标记 migrated = true
```

迁移后：

- 桌面端读取 SQLite。
- 浏览器端仍读取 localStorage。
- RAG 索引不迁移，直接从简历内容重建。

---

## 4. 功能二：RAG 简历与岗位匹配度

### 4.1 配置入口

设置页拆为两块：

```text
AI 配置

1. 对话模型配置
   - Provider: DeepSeek / 阿里云百炼 / 自定义
   - API Key
   - Base URL
   - Model
   - 测试对话模型

2. RAG 语义匹配配置
   - 模式: 自动 / 仅语义向量 / 仅关键词
   - Embedding Provider: 阿里云百炼，默认
   - API Key
   - Model: text-embedding-v4
   - Endpoint: 高级设置，默认隐藏
   - Dimension: 高级设置，可空
   - 测试 Embedding
```

用户没有配置 Embedding API Key 时：

```text
匹配度功能仍可使用，但会自动降级为本地关键词匹配。
```

### 4.2 RAG 工作流

```text
索引阶段
  -> 简历创建 / 导入 / 更新后触发
  -> Markdown 按结构分块
  -> 每个 chunk 调用阿里云百炼 text-embedding-v4
  -> 向量和元数据写入 rag_chunks

检索阶段
  -> 用户填写职位名称和 JD
  -> 对 "职位名称 + JD + 公司信息" 生成 query embedding
  -> 与该简历所有 chunk 向量计算余弦相似度
  -> 返回 Top-K 相关块

增强分析阶段
  -> 将 Top-K 证据、相似度、维度分数注入分析 Prompt
  -> 现有 AI 分析输出 OptimizationBasis
  -> 前端展示匹配度、证据块和优化依据
```

### 4.3 阿里云百炼 Embedding 接入

默认请求：

```http
POST {embeddingEndpoint}
Authorization: Bearer {embeddingApiKey}
Content-Type: application/json

{
  "model": "text-embedding-v4",
  "input": {
    "texts": ["文本内容"]
  },
  "parameters": {
    "dimension": 1024
  }
}
```

实现约定：

- 第一版 `dimension` 可以不传，使用模型默认维度。
- 如果用户填写 `embeddingDimension`，则传入 `parameters.dimension`。
- 索引简历 chunk 时，如果接口支持文本类型参数，按 `document` 处理。
- 查询岗位 JD 时，如果接口支持文本类型参数，按 `query` 处理。
- Rust 端根据返回结果实际向量长度写入 `embedding_dim`。

为了兼容其他服务商，Rust 端抽象为：

```rust
trait EmbeddingClient {
    async fn embed_documents(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String>;
    async fn embed_query(&self, text: &str) -> Result<Vec<f32>, String>;
}
```

第一版实现：

- `AliyunBailianEmbeddingClient`
- `OpenAICompatibleEmbeddingClient`，可选
- `Bm25Searcher`，不需要网络

### 4.4 分块策略

优先利用现有简历 Markdown 结构：

```text
# 姓名

## 求职意向
## 个人优势
## 工作经历
## 项目经历
## 教育背景
## 专业技能
```

分块规则：

- 按 `##` 标题切分一级 chunk。
- 根据标题推断类型：
  - `求职意向` -> `intent`
  - `个人优势` -> `summary`
  - `工作经历` -> `experience`
  - `项目经历` -> `project`
  - `教育背景` -> `education`
  - `专业技能` -> `skills`
  - 其他 -> `other`
- 单个 chunk 超过 1000-1500 字时，再按空行或列表项拆分。
- 每个 chunk 保留 `section_title`，便于前端展示来源。

### 4.5 检索与评分

向量检索：

```rust
cosine_similarity(query_embedding, chunk_embedding)
```

BM25 降级：

- 中英文简单 token 化。
- 中文按连续汉字、英文按单词、技术词保留原样。
- 计算 chunk 与 JD 的 BM25 分数。
- 返回同样的 `ChunkMatch` 结构。

匹配度分数：

```text
整体匹配度 =
  工作经历 30%
  项目经验 25%
  专业技能 25%
  个人优势 15%
  教育背景 5%
```

每个维度取 Top-2 chunk 加权平均。最后输出：

```typescript
export interface RagMatchResult {
  overallScore: number
  retrievalMode: 'embedding' | 'keyword'
  dimensionScores: Array<{
    dimension: string
    score: number
    weight: number
  }>
  topChunks: Array<{
    chunkId: string
    chunkType: string
    sectionTitle: string
    text: string
    score: number
  }>
}
```

### 4.6 注入分析 Prompt

现有 `RESUME_ANALYSIS_PROMPT` 增加 RAG 上下文：

```markdown
## RAG 匹配证据

检索方式：embedding / keyword
本地计算匹配度：82

### 维度分数
- 工作经历：78
- 项目经验：84
- 专业技能：88

### 最相关简历片段
1. [专业技能] 相似度 0.91
   ...

2. [项目经历] 相似度 0.86
   ...

请基于以上证据输出结构化优化依据。不得编造证据中不存在的项目、公司、学历、证书或量化成果。
```

AI 输出仍沿用当前 `OptimizationBasis`，但增加证据字段：

```typescript
export interface OptimizationBasis {
  fitSummary: string
  fitScore: number
  matchedAdvantages: string[]
  weakPoints: string[]
  transferableExperience: string[]
  keywordStrategy: string[]
  rewriteStrategy: string[]
  riskNotes: string[]
  rag?: RagMatchResult
}
```

### 4.7 Customize.vue 展示

在现有“简历优化依据”面板上增强，不新增复杂页面：

```text
简历与岗位匹配度                     82%
[进度条]

检索方式：语义向量 / 关键词降级

维度分数：
工作经历 78% | 项目经验 84% | 专业技能 88%

最相关经验：
- [专业技能] Vue / TypeScript / Vite...
- [项目经历] 低代码平台...

AI 分析建议：
沿用当前 matchedAdvantages / weakPoints / rewriteStrategy 等结构化卡片
```

如果 Embedding 调用失败：

```text
语义匹配暂不可用，已自动使用本地关键词匹配。
```

生成简历时：

- 如果存在 `optimizationBasis.rag`，注入生成 Prompt。
- 如果没有 RAG，也保留现有“直接生成简历”能力。

---

## 5. 前端改造点

### 5.1 平台检测

```typescript
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
```

### 5.2 数据适配层

```typescript
export const db = {
  resumes,
  applications,
  aiConfig,
  migration,
  rag,
}
```

约定：

- Adapter 方法统一返回 Promise。
- Tauri 环境调用 `invoke()`。
- 浏览器环境包装现有 localStorage 实现。
- Store 层统一改为 async/await。

### 5.3 设置页

`Settings.vue` 需要改造：

- AI 配置分为“对话模型”和“RAG 语义匹配”。
- 新增 Embedding 测试按钮。
- 数据管理文案从“所有数据存储在浏览器本地”改为“桌面端存储在本机数据库，浏览器模式存储在 localStorage”。
- 导出数据走 adapter，不直接读 `localStorage`。

### 5.4 简历 Store

简历创建、导入、更新后：

```text
保存简历
  -> 刷新列表
  -> Tauri 环境异步触发 rag_index_resume(resume.id)
  -> 索引失败只提示，不影响保存
```

### 5.5 定制页

`Customize.vue` 中 `handleAnalyze()` 调整为：

```text
检查表单
  -> rag_match_resume_job()
  -> 得到 RagMatchResult
  -> analyzeResumeOptimizationBasis(request + rag)
  -> 展示 OptimizationBasis + RagMatchResult
```

浏览器模式：

```text
rag_match_resume_job()
  -> TypeScript BM25
```

---

## 6. Rust 目录结构

```text
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── capabilities/
├── icons/
└── src/
    ├── main.rs
    ├── db.rs
    ├── models.rs
    ├── commands/
    │   ├── mod.rs
    │   ├── resumes.rs
    │   ├── applications.rs
    │   ├── config.rs
    │   ├── migration.rs
    │   └── rag.rs
    └── rag/
        ├── mod.rs
        ├── chunker.rs
        ├── embedding.rs
        ├── aliyun.rs
        ├── openai_compatible.rs
        ├── search.rs
        ├── scorer.rs
        └── bm25.rs
```

---

## 7. 依赖变化

### 7.1 前端依赖

```json
{
  "@tauri-apps/api": "^2.0.0",
  "@tauri-apps/cli": "^2.0.0"
}
```

如果做原生文件选择器，再加：

```json
{
  "@tauri-apps/plugin-dialog": "^2.0.0"
}
```

### 7.2 Rust 依赖

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4"] }
sha2 = "0.10"
```

---

## 8. 实现阶段

### Phase 1：Tauri 初始化 + 桌面壳

- 添加 Tauri 依赖和 `src-tauri/`。
- 配置窗口、图标、devUrl、frontendDist。
- 跑通 `npm run tauri:dev`。
- Windows 能启动桌面窗口。

### Phase 2：SQLite CRUD + 迁移

- 实现 SQLite 建表。
- 实现 resumes / applications / ai_config CRUD。
- 实现 localStorage 到 SQLite 迁移。
- 前端新增 `db-adapter.ts`。
- Store 层改为 async。

### Phase 3：BM25 本地检索基线

- Rust 实现 BM25。
- TypeScript 实现浏览器 BM25 降级。
- Customize.vue 能展示关键词匹配结果。
- 不依赖外部 API，先保证 RAG 工作流跑通。

### Phase 4：阿里云百炼 Embedding RAG

- 设置页新增 RAG 语义匹配配置。
- 实现 `AliyunBailianEmbeddingClient`。
- 实现向量存储、索引刷新、相似度检索。
- Embedding 失败时自动降级 BM25。

### Phase 5：优化依据和生成链路增强

- 分析 Prompt 注入 RAG 证据。
- 生成 Prompt 注入 RAG 证据和优化依据。
- 定制页展示匹配度、维度分数、Top-K 证据块。
- 保留“跳过分析直接生成”能力。

### Phase 6：Windows 打包与回归

- 打 NSIS / MSI 包。
- 安装后验证数据持久化、RAG、生成、导出、清空。

---

## 9. 验证计划

### 9.1 命令检查

- `npm run check`
- `npm run build`
- `cargo test`
- `npm run tauri:dev`
- `npm run tauri:build`

### 9.2 浏览器模式手动验证

1. 启动 Vite。
2. 创建简历。
3. 填写岗位信息。
4. 不配置 Embedding，点击分析。
5. 应显示 BM25/关键词匹配结果。
6. 点击生成简历，现有生成流程可用。
7. 保存为新简历、导出 MD/TXT 正常。

### 9.3 桌面模式手动验证

1. 首次启动桌面 App。
2. 如果 localStorage 有旧数据，迁移到 SQLite。
3. 创建/导入/编辑简历后自动刷新 RAG 索引。
4. 配置阿里云百炼 `text-embedding-v4`。
5. 点击测试 Embedding，返回成功。
6. 填写 JD 后点击分析，显示语义匹配结果。
7. 断网或填错 API Key，自动降级 BM25。
8. 生成、保存、投递、导出、清空数据正常。
9. 关闭并重启桌面 App，SQLite 数据仍存在。

### 9.4 RAG 单元测试

- Markdown 分块。
- chunk 类型识别。
- content_hash 变化检测。
- cosine similarity。
- BM25 排序。
- 匹配度维度加权。
- Embedding 失败降级。

---

## 10. 风险与约束

| 风险 | 处理 |
| --- | --- |
| 阿里云百炼接口参数变化 | Endpoint 和 Dimension 可配置，Rust 客户端集中封装 |
| 用户没有 Embedding Key | `ragMode = auto` 自动降级 BM25 |
| 简历更新后索引过期 | 使用 `resume_version` + `content_hash` 判断并重建 |
| 模型切换导致向量维度不一致 | 保存 `embedding_model` + `embedding_dim`，不一致时重建 |
| 桌面端和浏览器模式数据层不同 | Store 只依赖 adapter，隔离环境差异 |
| AI 编造简历内容 | Prompt 强约束只能基于原始简历和 RAG 证据 |

---

## 11. 第一版范围边界

第一版要做：

- Windows 桌面应用。
- SQLite 本地存储。
- localStorage 迁移。
- 阿里云百炼 `text-embedding-v4` 默认配置入口。
- Embedding RAG + BM25 降级。
- 简历定制页匹配度和证据展示。

第一版暂不做：

- 本地 embedding 模型。
- 多用户账户。
- 云同步。
- 复杂向量数据库。
- 历史分析报告管理。
- PDF/DOCX 导入迁移到 Rust，继续先用现有前端实现。
