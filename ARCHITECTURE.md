# AI 求职助手 — 架构分析与关键实现

## 一、项目概览

基于 **Tauri v2** 的桌面端 AI 求职助手，核心技术栈：

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2（Rust 后端 + WebView 前端） |
| 前端 | Vue 3 + TypeScript + Pinia + Vue Router |
| UI | Element Plus + Tailwind CSS + Lucide Icons |
| 后端语言 | Rust |
| 数据库 | SQLite（桌面端）/ localStorage（浏览器开发模式） |
| AI 集成 | OpenAI 兼容 API（DeepSeek / 阿里云百炼） |
| 向量化 | 阿里云百炼 text-embedding-v4 |
| 文档解析 | mammoth、pdfjs-dist、二进制 DOC 解析 |

---

## 二、整体架构

```
┌─────────────────────────────────────────────────┐
│                   Vue 3 前端                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Pinia   │ │  Vue     │ │  平台适配层       │ │
│  │  Stores  │ │  Router  │ │  db-adapter.ts    │ │
│  └──────────┘ └──────────┘ └────────┬─────────┘ │
│                                     │            │
│         ┌───────────────────────────┼─────┐      │
│         │      浏览器模式            │Tauri│     │
│         │  localStorage + TS RAG    │ IPC │     │
│         └───────────────────────────┘      │      │
├─────────────────────────────────────────────┼──────┤
│                    Rust 后端                  │      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │      │
│  │  SQLite  │ │  RAG 引擎 │ │  PDF 导出     │ │      │
│  │  CRUD    │ │  向量搜索  │ │  手动构建PDF  │ │      │
│  └──────────┘ └──────────┘ └──────────────┘ │      │
└─────────────────────────────────────────────────┘
```

---

## 三、核心架构模式

### 1. 平台适配器模式（Platform Adapter）

项目最关键的设计。`db-adapter.ts` 将所有数据操作统一为异步接口，根据运行环境自动选择后端：

```
调用层（Store）
    │
    ▼
db-adapter.ts  ←── isTauri()?
    │
    ├── true  → invokeTauri('command')  → Rust/SQLite
    │
    └── false → localStorage CRUD       → 浏览器内存
```

同样 RAG 系统也遵循此模式：
- **桌面端**：通过 Tauri IPC 调用 Rust 端 RAG（阿里云百炼嵌入向量 + BM25 降级）
- **浏览器端**：纯 TypeScript 实现 BM25 关键词匹配

这使得开发阶段可以用浏览器快速调试（热更新），发布时无缝切换到桌面应用。

### 2. RAG 检索增强生成全链路

#### 离线阶段（简历入库时）

```
简历 Markdown
    │
    ▼
chunkResumeForRag() → 按 ## 标题切分
    │
    ├── 推断块类型（经验/项目/技能/总结/教育）
    │
    ▼
调用嵌入 API → 浮点向量 → 存入 SQLite
```

#### 在线阶段（定制简历时）

```
职位描述（JD）
    │
    ▼
调用嵌入 API → JD 向量
    │
    ▼
与简历块向量做余弦相似度计算
    │
    ├── 成功 → 语义向量搜索结果
    │
    └── 失败 → 自动降级为 BM25 关键词搜索
    │
    ▼
维度加权打分（经验30%、项目25%、技能25%、总结15%、教育5%）
    │
    ▼
取 Top-N 块 → 格式化上下文 → 注入 Prompt
```

#### 桌面端三种 ragMode

| ragMode | 行为 |
|---------|------|
| `auto` | 优先语义向量，失败自动降级 BM25 |
| `embedding` | 仅语义向量，失败则报错 |
| `keyword` | 仅 BM25 关键词匹配，不调 embedding API |

### 3. BM25 关键词检索

BM25 是 RAG 系统的"永远可用的底盘"，即使没配置 embedding API 也能独立完成匹配。

#### 算法公式

```
BM25(D, Q) = Σ IDF(qi) × TF_saturated(qi, D)

IDF = ln(1 + (N - df + 0.5) / (df + 0.5))
TF_saturated = (tf × (k1 + 1)) / (tf + k1 × (1 - b + b × docLen / avgLen))
```

参数：k1=1.5（词频饱和），b=0.75（长度归一化强度）

#### 相比 TF-IDF 的改进

- **词频饱和**：一个词出现 100 次不会比出现 10 次相关 100 倍（k1 控制）
- **长度归一化**：消除长文档天然命中更多词的偏差（b 控制）

#### CJK 分词

不做真正的中文分词（不依赖 jieba 等库），而是暴力生成 bigram 子词：

```
"前端工程师" → ["前端工程师", "前端", "端工", "工程", "程师"]
```

保留原词 + 相邻二字对，过滤单字噪音。零依赖、跨语言一致。

#### 分数归一化

BM25 原始分数无界，用饱和函数映射到 [0, 100]：

```
normalized = score / (score + 4) × 100
```

### 4. Prompt 工程与防御性解析

#### 两个 Prompt 模板

**分析 Prompt**（`RESUME_ANALYSIS_PROMPT`）：
- 注入 RAG 检索到的相关经历块作为上下文
- 输出结构化 JSON，包含 7 字段：fitSummary、fitScore、matchedAdvantages、weakPoints、transferableExperience、keywordStrategy、rewriteStrategy、riskNotes
- 温度 0.4（低温度提高结构化输出稳定性）

**生成 Prompt**（`RESUME_GENERATION_PROMPT`）：
- 11 条严格格式规则（禁止 table/code fence/emoji、分割线位置、模块命名等）
- 8 条优化规则（遵循分析依据、禁止编造数据等）
- 温度 0.7（适当提高创意性）

#### 防御性解析

LLM 输出不可靠，需要多层防御：

```typescript
// 第一层：剥离 markdown 代码围栏
cleanJsonContent()     // 去掉 ```json ... ``` 包裹

// 第二层：JSON.parse
JSON.parse(cleaned)

// 第三层：类型安全校验 + 默认值回填
normalizeOptimizationBasis()
  ├── 字符串字段：typeof 检查 + trim + 空值默认回填
  ├── 数字字段：isFinite 检查 + clamp [0,100] + 默认 0
  └── 数组字段：Array.isArray + 元素类型过滤 + 去空
```

#### 状态过期标记

`basisStale` 标记：岗位信息变更时自动置为 true，防止用户基于过期的分析依据生成简历，造成"分析结果和 JD 对不上"的问题。

### 5. 跨语言双实现

RAG 的 BM25 在两端用不同语言各实现一遍，算法完全同构：

| | TypeScript | Rust |
|---|---|---|
| 分块 | `chunkResumeForRag()` | `chunk_resume()` |
| 分词 | `tokenize()` bigram | `tokenize()` + `push_token()` |
| BM25 | `bm25Score()` | `bm25_score()` |
| 维度评分 | `buildDimensionScores()` | `dimension_scores()` |
| 加权总分 | `weightedOverallScore()` | `overall_score()` |
| 嵌入向量 | 不支持 | `aliyun_embed()` + `cosine_similarity()` |

### 6. 非结构化文档处理

AI 应用的数据入口，决定最终输出质量的上限：

| 格式 | 方案 | 关键技巧 |
|------|------|---------|
| Markdown/TXT | 直接读取 | — |
| DOCX | mammoth 库 | 中英文样式映射 |
| PDF | pdfjs-dist 提取文本 | 视觉位置重建行 → 推断 Markdown 结构 |
| 旧版 DOC | 二进制 OLE 解析 | 多编码试探（GBK/UTF-8/Big5）→ 噪音评分，选最低噪音结果 |

`readLegacyDocFile()` 中的**噪音评分过滤**是亮点：不依赖编码检测的猜测正确率，而是对每种解码结果计算控制字符和不可打印字符的比例，选择噪音最低的结果。

### 7. 手动 PDF 构建

`exporter.rs` 中 Rust 端不依赖任何 PDF 库，完全手工构建 PDF 1.4 文档：

```
PDF 结构:
%PDF-1.4
1 0 obj (Catalog)
2 0 obj (Pages)
3 0 obj (CID 字体 - UniGB-UCS2-H 编码)
4 0 obj (CIDFontType0 - STSong-Light)
5+2n 0 obj (每页的 Page 对象)
5+2n+1 0 obj (每页的内容流)
xref 表
trailer
%%EOF
```

中文渲染使用 UTF-16BE 十六进制编码的 CID 字体方案（`UniGB-UCS2-H`），这是在没有完整 PDF 库时处理 CJK 文本的经典做法。

---

## 四、数据流：简历定制 Workflow

应用中最复杂的业务场景：

```
Customize.vue 页面
    │
    ├─ Step 1: 选择简历 + 填写公司和岗位信息
    │     │
    │     ├── 岗位信息变更 → basisStale = true（标记旧分析已过期）
    │     │
    │     ▼
    │   【点击"开始分析"】
    │     │
    │     ├── 1. db.rag.matchResumeJob() → RAG 检索
    │     │      结果 → RagMatchResult（模式、分数、维度分布）
    │     │
    │     ├── 2. 组装 Prompt（RAG 上下文 + 简历 + JD + 公司信息）
    │     │
    │     ├── 3. 调用 LLM → 期望输出 OptimizationBasis JSON
    │     │
    │     ├── 4. cleanJsonContent() + normalizeOptimizationBasis()
    │     │
    │     └── 5. 展示优化依据面板（含 RAG 证据）
    │
    ├─ Step 2: 用户审查优化依据 + 填写补充要求
    │     │
    │     ▼
    │   【点击"生成新简历"】
    │     │
    │     ├── 1. 组装 Generation Prompt
    │     │      = 原简历 + JD + 优化依据 + RAG 证据 + 用户额外要求
    │     │
    │     ├── 2. 调用 LLM → 输出纯 Markdown 简历
    │     │
    │     └── 3. 展示在右侧预览面板，支持 Markdown/源码切换
    │
    └─ 可选：保存为新简历条目
```

---

## 五、项目目录结构

```
工作简历AI助手/
├── src/                          # Vue 3 前端
│   ├── components/
│   │   └── Layout/
│   │       └── AppLayout.vue     # 侧边栏布局 + 导航
│   ├── router/
│   │   └── index.ts              # 7 条路由
│   ├── stores/
│   │   ├── ai.ts                 # AI 配置 + 定制页状态
│   │   ├── application.ts        # 投递记录
│   │   └── resume.ts             # 简历 CRUD
│   ├── types/
│   │   └── index.ts              # 全部 TS 类型定义
│   ├── utils/
│   │   ├── ai.ts                 # AI API 调用 + Prompt 模板
│   │   ├── constants.ts          # 常量 + 格式化工具
│   │   ├── db-adapter.ts         # 平台适配层（Tauri IPC / localStorage）
│   │   ├── db.ts                 # localStorage CRUD 实现
│   │   ├── markdown.ts           # 文档解析 + 导入导出（~810 行）
│   │   ├── message.ts            # Element Plus 消息封装
│   │   ├── platform.ts           # 平台检测 + Tauri IPC 封装
│   │   └── rag.ts                # TS 端 RAG（分块 + BM25 检索）
│   ├── views/
│   │   ├── ApplicationDetail.vue # 投递详情
│   │   ├── ApplicationList.vue   # 投递列表
│   │   ├── Customize.vue         # 简历定制（最复杂页面）
│   │   ├── Dashboard.vue         # 首页仪表盘
│   │   ├── ResumeDetail.vue      # 简历编辑 + 预览
│   │   ├── ResumeList.vue        # 简历列表
│   │   └── Settings.vue          # 设置页面
│   ├── App.vue
│   ├── main.ts
│   └── style.css
├── src-tauri/                    # Rust 后端
│   └── src/
│       ├── main.rs               # Tauri 入口 + 命令注册
│       ├── models.rs             # Rust 数据模型（与 TS 对应）
│       ├── db.rs                 # SQLite CRUD
│       ├── exporter.rs           # 手动 PDF 构建
│       ├── commands/
│       │   └── mod.rs            # 19 个 Tauri 命令
│       └── rag/
│           └── mod.rs            # Rust 端 RAG（分块 + 嵌入 + BM25）
├── DESIGN.md                     # 架构设计文档
├── vite.config.ts
├── package.json
└── Cargo.toml
```

---

## 六、技术亮点总结

| 亮点 | 说明 |
|------|------|
| **平台适配器模式** | 一次开发，浏览器调试 + 桌面部署两用 |
| **RAG 全链路自研** | 分块策略、向量检索、BM25 降级、维度加权、上下文注入 |
| **自动降级机制** | 嵌入 API 不可用 → 自动切换本地 BM25，用户无感 |
| **防御性 Prompt 设计** | 结构化输出 + 格式约束 + 类型安全解析 + 默认值保险 |
| **多文档格式导入** | 覆盖 PDF/DOCX/DOC/MD/TXT，噪音评分过滤策略实用 |
| **纯手工 PDF 导出** | 不依赖第三方 PDF 库，CID 字体 + UTF-16BE 编码 |
| **CJK 感知分词** | BM25 的中文 bigram 子词切分，零额外依赖 |
| **组合式 Store 设计** | Pinia setup stores 模式，状态逻辑清晰可测 |

---

## 七、作为 AI 时代前端工程师的启示

### 第一课：从"调 API"到"系统工程"

会调用 `fetch('/chat/completions')` 只是起点。整个项目展示了需要掌握的完整链路：

```
数据采集 → 数据存储 → 检索引擎 → Prompt 拼装 → LLM 调用 → 输出解析 → 结果呈现
```

核心竞争力不再是"会用 React/Vue"，而是**能设计并实现完整的 AI 产品链路**。

### 第二课：平台适配层是生产力放大器

浏览器端开发体验好（热更新快），但最终交付桌面应用。适配器模式让两者兼得。此模式还可扩展至 Electron→Tauri 迁移、PWA 轻量版、不同云服务商 API 适配等场景。

### 第三课：RAG 就是五件事

分块 → 向量化 → 搜索 → 打分 → 注入。BM25 作为降级方案特别实用——在大多数个人项目中，纯 BM25 已经足够好用。

### 第四课：Prompt 工程的核心是"防御"

LLM 的输出不可靠，永远不要假设它返回完美数据。三条法则：
1. **格式约束前置**：在 Prompt 里明确输出格式和禁止项
2. **解析做防御**：剥离代码围栏 → 类型检查 → 默认值回填
3. **状态标记过期**：用 `basisStale` 防止脏数据进入生成流程

### 第五课：跨语言能力正在成为标配

TypeScript + Rust 不是"前端 + 后端"的职责划分，而是同一套逻辑在不同环境的最优实现。AI 时代对性能敏感的操作会越来越多由 WASM/Rust 承担。

### 第六课：数据入口比模型更重要

再好的 Prompt 和 RAG，喂入垃圾数据也只能产出垃圾。`markdown.ts` 中近 800 行的文档解析逻辑——PDF 布局重建、旧 DOC 多编码试探、噪音评分过滤——这些"脏活"恰恰是 AI 应用质量的根基。
