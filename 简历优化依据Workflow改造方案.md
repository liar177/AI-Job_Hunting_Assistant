# 简历定制：优化依据 Workflow 改造方案

## 1. 结论

当前文档里的“两次 AI 调用”方向是有参考价值的，但它应该是“增强型 workflow”，不能让分析步骤阻塞核心简历生成功能：

```text
原始简历 + 公司/岗位信息
  -> 可选增强：第一次模型调用分析简历优化依据
  -> 用户查看优化依据
  -> 第二次模型调用生成定制简历
     - 有优化依据：基于依据生成
     - 无优化依据：基于原始简历和岗位信息直接生成
```

但原方案中有三点需要调整：

1. 优化依据不放到右侧 Tab，改为放在左侧内容区。
2. 优化依据不使用 Markdown 渲染，改为结构化 JSON 数据驱动的可视化面板。
3. 不默认自动连续执行两次模型调用，改为用户先点击“分析优化依据”，确认后再生成；如果分析失败或用户不想等待分析，仍允许直接生成简历。

最终页面心智：

```text
左侧：输入信息 + 优化依据 + 操作控制
右侧：只展示最终优化简历预览 / Markdown 源码
```

这样右侧保持纯净，左侧承担决策和 workflow 控制。

---

## 2. 当前代码状态

`src/views/Customize.vue` 目前是单页左右分栏布局：

- 左侧：API Key 提示、选择简历、岗位信息、生成后操作
- 右侧：简历结果面板，包含 `预览 / Markdown 源码` 两个 Tab

当前 AI 调用链路：

```text
Customize.vue handleGenerate()
  -> aiStore.generate(request)
    -> generateResume()
      -> RESUME_GENERATION_PROMPT
        -> 返回定制简历 Markdown
```

当前缺少：

- 中间分析结果
- 简历与岗位的匹配依据
- 生成策略可解释性
- 用户在生成前确认 AI 理解是否正确的机会

---

## 3. 最终 Workflow

推荐改造为“可降级”的手动确认式 workflow：

```text
填写左侧信息
  -> 点击“分析优化依据”
    -> 调用 analyzeResumeOptimizationBasis()
    -> 左侧展示结构化优化依据
    -> 如果分析失败，允许跳过分析直接生成
  -> 点击“基于依据生成简历”或“直接生成简历”
    -> 调用 generateResumeWithBasis()
    -> 右侧展示最终简历
```

不建议第一版做自动连续执行，原因：

- 优化依据是这个功能的新增价值，应让用户明确看见。
- 用户可以先判断 AI 是否误解岗位或简历。
- 分析失败时不能阻塞核心生成能力，用户应能降级直接生成。
- 生成失败时可以保留依据并单独重试生成。
- 后续如果要支持编辑优化依据，手动确认式流程更自然。

---

## 4. 优化依据数据结构

第一次模型调用建议要求输出 JSON，不直接输出 Markdown。

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
}
```

字段说明：

| 字段 | 含义 | 展示方式 |
|------|------|----------|
| `fitSummary` | 总体匹配摘要 | 面板顶部一句话摘要 |
| `fitScore` | 匹配度，0-100 | 顶部数字 + 进度条 |
| `matchedAdvantages` | 已匹配优势 | 绿色模块 |
| `weakPoints` | 缺少或较弱能力 | 柔和琥珀色模块 |
| `transferableExperience` | 可迁移经历 | 天蓝色模块 |
| `keywordStrategy` | 关键词策略 | 靛蓝色模块 |
| `rewriteStrategy` | 修改策略 | 青色模块 |
| `riskNotes` | 风险提示 | 柔和玫红色模块 |

为了兼容模型偶尔输出不规范的问题，可以在前端保留一个兜底：

- 优先解析 JSON
- 如果解析失败，显示错误提示：“优化依据解析失败，请重新分析”
- 第一版不建议再回退为 Markdown 展示，否则 UI 复杂度会上升

---

## 5. 左侧优化依据面板设计

位置：放在 `岗位信息` 卡片下方、`生成后操作` 上方。

默认状态：

- 未分析：显示简洁占位说明和“分析优化依据”按钮
- 分析中：显示 loading，“正在识别优势、差距和修改策略...”
- 分析成功：显示结构化彩色依据面板
- 分析失败：显示错误，同时提供“重新分析”和“跳过分析直接生成”

面板结构：

```text
简历优化依据                         匹配度 82%
[进度条]

项目经历与 Vue / TypeScript 技术栈匹配度较高，建议强化业务结果、性能优化和协作表达。

[已匹配优势] [缺少或较弱能力]
[可迁移经历] [关键词策略]
[修改策略]   [风险提示]

[重新分析] [基于依据生成简历]
```

如果分析失败：

```text
优化依据分析失败
本次可以跳过分析，直接根据原始简历和岗位信息生成定制简历。

[重新分析] [跳过分析直接生成]
```

视觉规范：

| 模块 | 颜色语义 | 建议 Tailwind 样式 | 图标 |
|------|----------|--------------------|------|
| 已匹配优势 | 积极、确定、增强信心 | `bg-emerald-50 text-emerald-800 border-emerald-100` | `CheckCircle2` |
| 缺少或较弱能力 | 警示但不焦虑 | `bg-amber-50 text-amber-800 border-amber-100` | `AlertTriangle` |
| 可迁移经历 | 可挖掘、可转化 | `bg-sky-50 text-sky-800 border-sky-100` | `RefreshCw` |
| 关键词策略 | 精准匹配、ATS 友好 | `bg-indigo-50 text-indigo-800 border-indigo-100` | `Tags` |
| 修改策略 | 行动、执行 | `bg-cyan-50 text-cyan-800 border-cyan-100` | `ListTodo` |
| 风险提示 | 谨慎、避免夸大 | `bg-rose-50 text-rose-800 border-rose-100` | `ShieldAlert` |

排版建议：

- 左侧宽度有限，模块用 `grid grid-cols-1 sm:grid-cols-2`。
- 每个模块最多展示 2-3 条，避免撑爆左侧。
- 后续可增加“展开更多”，第一版可以先截断。
- 卡片圆角保持 8px，贴合当前页面风格。
- 不把模块做得过于花哨，整体仍然是工具型 SaaS 风格。

---

## 6. 右侧结果区调整

右侧保持当前纯净结构，不新增“优化依据”Tab。

保留：

- `预览`
- `Markdown 源码`

空状态文案建议改为：

```text
在左侧填写岗位信息后，可以先分析优化依据，也可以直接生成定制简历
生成完成后，可在这里预览定制简历，或切换到 Markdown 源码进行微调。
```

生成中状态文案建议改为：

```text
AI 正在生成定制简历...
```

如果已有优化依据，可以补充为：

```text
AI 正在根据优化依据生成简历...
```

右侧不展示：

- 匹配优势
- 技能差距
- 修改策略
- 风险提示

这些都属于左侧决策区。

---

## 7. 类型改造

建议新增独立请求类型，而不是只在现有 `GenerateRequest` 上加可选字段。

```typescript
export interface AnalyzeRequest {
  resumeContent: string
  companyName: string
  jobTitle: string
  jobDescription: string
  companyInfo: string
}

export interface OptimizationBasis {
  fitSummary: string
  fitScore: number
  matchedAdvantages: string[]
  weakPoints: string[]
  transferableExperience: string[]
  keywordStrategy: string[]
  rewriteStrategy: string[]
  riskNotes: string[]
}

export interface AnalyzeResponse {
  success: boolean
  data?: OptimizationBasis
  rawContent?: string
  error?: string
}

export interface GenerateRequest extends AnalyzeRequest {
  optimizationBasis?: OptimizationBasis
}
```

当前 `GenerateResponse` 可以继续沿用：

```typescript
export interface GenerateResponse {
  success: boolean
  content: string
  error?: string
}
```

顺手补充 `companyName` 和 `jobTitle` 很有必要，因为它们现在只用于页面保存标题，没有传给模型。

---

## 8. AI 工具函数改造

`src/utils/ai.ts` 建议改成三层：

```text
callChatCompletion(prompt, temperature)
  -> analyzeResumeOptimizationBasis(request)
  -> generateResumeWithBasis(request)
```

### 8.1 第一次 Prompt：分析优化依据

要求：

- 只分析，不生成简历。
- 输出严格 JSON。
- 不要使用 Markdown 代码块。
- `fitScore` 必须是 0-100 的数字。
- 每个数组尽量 2-4 条。
- 风险提示必须约束“不能编造经历”。

建议输出格式：

```json
{
  "fitSummary": "一句话总结候选人与岗位的匹配情况",
  "fitScore": 82,
  "matchedAdvantages": ["..."],
  "weakPoints": ["..."],
  "transferableExperience": ["..."],
  "keywordStrategy": ["..."],
  "rewriteStrategy": ["..."],
  "riskNotes": ["..."]
}
```

### 8.2 第二次 Prompt：生成简历

输入：

- 原始简历
- 公司名称
- 职位名称
- 岗位描述
- 公司信息
- 结构化优化依据，可选

要求：

- 如果存在优化依据，必须优先遵循优化依据。
- 如果没有优化依据，则按原始简历、岗位描述和公司信息直接生成。
- 输出纯 Markdown 简历。
- 不输出解释性文字。
- 不新增虚假公司、项目、学历、证书。
- 对缺少技能只能谨慎表达为“了解 / 学习中 / 相关接触”，不能写成精通。
- 保留当前简历格式规则：姓名一级标题、模块二级标题、模块标题下方分割线 `---`。

---

## 9. Store 改造

`src/stores/ai.ts` 建议新增独立状态：

```typescript
const analyzing = ref(false)
const generating = ref(false)
const optimizationBasis = ref<OptimizationBasis | null>(null)
const lastResult = ref<GenerateResponse | null>(null)

async function analyze(request: AnalyzeRequest): Promise<AnalyzeResponse>
async function generate(request: GenerateRequest): Promise<GenerateResponse>
```

这样页面可以分别显示：

- 分析中
- 生成中
- 分析失败
- 生成失败

不要用一个 `generating` 状态覆盖两种模型调用。

---

## 10. Customize.vue 状态设计

建议新增：

```typescript
const optimizationBasis = ref<OptimizationBasis | null>(null)
const analysisError = ref('')
const errorMsg = ref('')
const activeTab = ref<'preview' | 'source'>('preview')
```

计算属性：

```typescript
const canAnalyze = computed(() =>
  !!selectedResume.value &&
  !!companyName.value.trim() &&
  !!jobTitle.value.trim() &&
  !!jobDescription.value.trim() &&
  hasApiKey.value
)

const canGenerateResume = computed(() =>
  canAnalyze.value
)
```

第一次调用：

```typescript
async function handleAnalyze() {
  if (!canAnalyze.value || !selectedResume.value) return

  analysisError.value = ''
  errorMsg.value = ''
  generatedContent.value = ''
  savedSuccess.value = false
  savedResumeId.value = ''

  const result = await aiStore.analyze({
    resumeContent: selectedResume.value.content,
    companyName: companyName.value,
    jobTitle: jobTitle.value,
    jobDescription: jobDescription.value,
    companyInfo: companyInfo.value,
  })

  if (result.success && result.data) {
    optimizationBasis.value = result.data
    return
  }

  analysisError.value = result.error || '分析失败'
}
```

第二次调用：

```typescript
async function handleGenerate() {
  if (!canGenerateResume.value || !selectedResume.value) return

  errorMsg.value = ''
  generatedContent.value = ''
  savedSuccess.value = false
  savedResumeId.value = ''
  activeTab.value = 'preview'

  const result = await aiStore.generate({
    resumeContent: selectedResume.value.content,
    companyName: companyName.value,
    jobTitle: jobTitle.value,
    jobDescription: jobDescription.value,
    companyInfo: companyInfo.value,
    optimizationBasis: optimizationBasis.value || undefined,
  })

  if (result.success) {
    generatedContent.value = result.content
    return
  }

  errorMsg.value = result.error || '生成失败'
}
```

---

## 11. 边界处理

| 场景 | 处理方式 |
|------|----------|
| API Key 未配置 | 保留现有黄色警告，分析和生成按钮禁用 |
| 分析失败 | 左侧优化依据卡片内显示错误，提供“重新分析”和“跳过分析直接生成” |
| 生成失败 | 保留优化依据，右侧显示生成错误，允许重新生成 |
| 修改左侧输入 | 清空已生成简历，保留或提示优化依据可能已过期 |
| 更换简历 | 清空优化依据和生成结果 |
| 重新分析 | 清空旧优化依据和生成结果 |
| 未分析直接生成 | 允许生成，使用原始简历 + 岗位信息走原有生成能力 |
| 保存为新简历 | 沿用现有 `cleanGeneratedContent()` |
| 添加到投递 | 沿用现有 query 参数跳转逻辑 |

建议第一版简单处理：

- 更换简历时清空优化依据和生成结果。
- 修改公司、职位、JD 时清空生成结果，并显示“优化依据可能已过期，可重新分析”。

---

## 12. 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/types/index.ts` | 新增 `AnalyzeRequest`、`OptimizationBasis`、`AnalyzeResponse`，扩展 `GenerateRequest` |
| `src/utils/ai.ts` | 新增分析 prompt、JSON 解析、`analyzeResumeOptimizationBasis()`，生成 prompt 注入优化依据 |
| `src/stores/ai.ts` | 新增 `analyzing`、`optimizationBasis`、`analyze()` |
| `src/views/Customize.vue` | 左侧新增优化依据面板，按钮拆成分析/生成，右侧保持预览/源码 |

可选后续拆分：

| 文件 | 用途 |
|------|------|
| `src/components/Customize/OptimizationBasisPanel.vue` | 把左侧依据面板拆成独立组件，减少 `Customize.vue` 体积 |

如果第一版改动控制在较小范围，可以先不拆组件。

---

## 13. 验证清单

1. 未配置 API Key 时，分析和生成按钮不可用。
2. 选择简历、填写公司、职位、JD 后，可以点击“分析优化依据”。
3. 分析中左侧显示 loading。
4. 分析成功后，左侧出现彩色结构化优化依据面板。
5. “已匹配优势 / 缺少或较弱能力 / 可迁移经历 / 关键词策略 / 修改策略 / 风险提示”颜色区分清晰。
6. 右侧仍然只有“预览 / Markdown 源码”两个 Tab。
7. 点击“基于依据生成简历”后，右侧显示生成 loading。
8. 生成成功后，右侧预览展示简历。
9. 生成失败时，左侧优化依据不丢失。
10. 分析失败时，可以点击“跳过分析直接生成”，右侧正常生成简历。
11. 不点击分析时，也可以保留一个“直接生成简历”的降级入口。
12. 保存为新简历、添加到投递、导出 MD、导出 TXT 仍正常。
13. Markdown 源码编辑后，预览和保存状态仍按原逻辑工作。

---

## 14. 分阶段落地建议

第一阶段：完成核心 workflow。

- 新增分析调用。
- 新增结构化优化依据面板。
- 最终生成时优先带上优化依据；没有依据时仍可直接生成。
- 不做历史记录，不做编辑依据。

第二阶段：提升体验。

- 支持展开更多分析条目。
- 支持“优化依据已过期”提示。
- 可选支持编辑依据。

第三阶段：沉淀数据。

- 可考虑把优化依据保存到投递记录或新增定制记录。
- 支持回看某次投递使用的依据和定制简历。
