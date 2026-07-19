// AI API 调用层 —— Prompt 模板 + LLM 通信 + 防御性解析
//
// 整个 AI 功能的三个核心模块都在此文件中：
//   1. Prompt 工程（两个 Prompt 模板，控制 LLM 行为）
//   2. API 通信（OpenAI 兼容的 chat/completions 调用）
//   3. 防御性解析（cleanJsonContent + normalizeOptimizationBasis）
//
// 两个 Prompt 的设计思路：
//   - 分析 Prompt（温度 0.4）：结构化 JSON 输出，低温度保证稳定性
//   - 生成 Prompt（温度 0.7）：创意性 Markdown 输出，适当提高温度

import type {
  AIConfig,
  AnalyzeRequest,
  AnalyzeResponse,
  GenerateRequest,
  GenerateResponse,
  OptimizationBasis,
  SelfIntroductionRequest,
} from '@/types'
import { db } from './db-adapter'
import { formatRagContext } from './rag'
import { formatSelfIntroductionDirection } from './self-introduction'

/**
 * 默认优化依据 —— 当 LLM 返回的 JSON 不完整或解析失败时使用
 *
 * 每个字段都有合理的默认值，确保即使 AI 调用完全失败，
 * 后续的简历生成仍然可以继续（降级为基于原始简历 + JD 直接优化）。
 * 这是「降级优雅」原则在数据层的体现。
 */
const DEFAULT_BASIS: OptimizationBasis = {
  fitSummary: '暂未生成优化依据，可直接根据原始简历与岗位信息生成定制简历。',
  fitScore: 0,
  matchedAdvantages: [],
  weakPoints: [],
  transferableExperience: [],
  keywordStrategy: [],
  rewriteStrategy: [],
  riskNotes: [],
}

/**
 * 简历分析 Prompt
 *
 * 设计要点：
 *   1. RAG 上下文注入 —— {ragContext} 携带语义匹配到的简历片段
 *   2. 明确的 JSON Schema —— 减少 LLM 输出格式偏差
 *   3. 可执行性约束 —— 要求"具体、可执行"，防止空泛建议
 *   4. 反幻觉约束 —— "不要编造原始简历中没有的信息"
 *   5. 温度 0.4 —— 分析任务需要确定性，低温度减少随机性
 */
const RESUME_ANALYSIS_PROMPT = `你是一位资深简历优化顾问。请对原始简历和目标岗位做匹配分析，输出用于后续简历定制的结构化优化依据。

## 输入信息

### 原始简历
{resumeContent}

### 目标公司
{companyName}

### 目标职位
{jobTitle}

### 目标岗位描述
{jobDescription}

### 目标公司信息
{companyInfo}

### RAG 匹配证据（可能为空）
{ragContext}

## 输出要求
1. 只输出 JSON，不要输出 Markdown，不要使用代码块，不要添加解释性文字。
2. fitScore 必须是 0-100 的数字。
3. 每个数组尽量控制在 2-4 条，语言具体、可执行。
4. 必须明确区分已有优势和缺少/较弱能力。
5. 不要编造原始简历中没有的公司、项目、学历、证书、技能熟练度。
6. 风险提示必须提醒哪些内容不能夸大或需要谨慎表达。
7. 如果提供了 RAG 匹配证据，必须优先基于证据判断匹配优势、差距和风险。

## JSON 格式
{
  "fitSummary": "一句话总结候选人与岗位的匹配情况",
  "fitScore": 82,
  "matchedAdvantages": ["已匹配优势1", "已匹配优势2"],
  "weakPoints": ["缺少或较弱能力1", "缺少或较弱能力2"],
  "transferableExperience": ["可迁移经历1", "可迁移经历2"],
  "keywordStrategy": ["关键词策略1", "关键词策略2"],
  "rewriteStrategy": ["修改策略1", "修改策略2"],
  "riskNotes": ["风险提示1", "风险提示2"]
}`

/**
 * 简历生成 Prompt
 *
 * 设计要点：
 *   1. 严格的格式模板 —— 保证输出简历结构统一
 *   2. 禁止项明确 —— table/code fence/emoji/方括号 等会破坏排版
 *   3. 优化规则优先级 —— 有优化依据时遵循，没有则直接优化
 *   4. 反幻觉约束 —— "禁止编造量化指标、公司、项目、学历等"
 *   5. 温度 0.7 —— 生成任务需要一定的表达灵活性
 */
const RESUME_GENERATION_PROMPT = `你是一位专业的简历优化专家。请严格按照以下格式重新定制简历，**不要**参考原始简历的格式。

## 输入信息

### 原始简历
{resumeContent}

### 目标公司
{companyName}

### 目标职位
{jobTitle}

### 目标岗位描述
{jobDescription}

### 目标公司信息
{companyInfo}

### 简历优化依据（可能为空）
{optimizationBasis}

### RAG 匹配证据（可能为空）
{ragContext}

## 输出格式（必须严格遵守，逐字逐句匹配）

分割线必须放在每个模块标题的下一行。

\`\`\`markdown
# 姓名

电话：XXX | 邮箱：XXX | X年XX开发经验

## 求职意向
---

目标职位 | 目标城市

## 个人优势
---

- 优势1（突出量化成果和核心能力）
- 优势2（突出技术栈和项目经验）
- 优势3（突出软技能和团队协作能力）

## 工作经历
---

**公司名称 | 职位名称**
YYYY.MM - YYYY.MM
- 职责描述1
- 职责描述2
- 职责描述3

**公司名称 | 职位名称**
YYYY.MM - YYYY.MM
- 职责描述...

## 项目经历
---

**项目名称 | 项目描述**
技术栈：XXX + XXX + XXX
- 项目内容1
- 项目内容2
- 项目内容3

## 教育背景
---

**学校名称 | 专业名称**
YYYY.MM - YYYY.MM
学历：XXX

## 专业技能
---

- 技能类别1：技能1、技能2、技能3
- 技能类别2：技能1、技能2、技能3
\`\`\`

## 格式规则（必须严格遵守）
1. **【最重要】分割线必须放在每个模块标题（##）的下一行，格式为三个短横线---**
2. **禁止使用方括号[]**，模块名称只能是：求职意向、个人优势、工作经历、项目经历、教育背景、专业技能
3. 姓名使用一级标题(#)，单独一行
4. 联系方式必须在同一行，用竖线"|"分隔；只保留原始简历明确提供的信息，禁止编造性别、年龄、城市等个人信息
5. 模块标题使用二级标题(##)，每个模块独占一行
6. 时间格式统一为"YYYY.MM - YYYY.MM"
7. 技术栈用加号"+"连接
8. 个人优势部分控制在3-5条，突出核心竞争力和量化成果
9. 专业技能按类别分组展示，每项技能用顿号分隔，突出与目标岗位匹配的技能
10. 工作经历每条控制在3-5条职责描述
11. 项目经历每条控制在3-5条描述

## 优化规则
1. 根据岗位描述调整内容重点
2. 突出匹配的技能和经验
3. 优先使用原始简历中已有的量化数据；如果原始简历没有具体数字，禁止编造百分比、访问量、人数、金额等量化指标
4. 语言专业精炼
5. 如果提供了简历优化依据，必须优先遵循其中的匹配优势、缺少能力、关键词策略、修改策略和风险提示
6. 如果没有提供简历优化依据，则直接根据原始简历、目标公司和岗位描述完成优化
7. 不新增虚假公司、项目、学历、证书、个人信息、量化成果；对缺少技能只能谨慎表达为"了解""学习中""相关接触"，不能写成精通
8. 如果提供了 RAG 匹配证据，必须把最相关片段作为内容取舍依据，不得补写证据和原始简历中不存在的事实

请直接输出纯Markdown格式的简历内容，不要使用代码块，直接输出内容即可，不要包含任何解释性文字。`

const SELF_INTRODUCTION_PROMPT = `你是一位资深面试辅导顾问。请根据候选人的真实简历和目标岗位，生成一段适合面试开场口述的中文个人自我介绍。

## 输入信息

### 原始简历
{resumeContent}

### 目标公司
{companyName}

### 目标职位
{jobTitle}

### 目标岗位描述
{jobDescription}

### 目标公司信息
{companyInfo}

### 可选优化依据
{optimizationBasis}

### 自我介绍优化方向
{selfIntroductionDirection}

## 生成要求
1. 自我介绍预计口述时长必须控制在两分钟以内，建议 280-400 个中文字符。
2. 开头简要说明职业定位、相关年限和核心能力，其他背景简单带过。
3. 主体重点讲一个与目标岗位高度匹配且有深度的工作或项目经历，说明背景、本人职责、关键行动、结果以及与岗位的关联。
4. 结尾自然总结岗位匹配点和求职意愿，不要使用空泛口号。
5. 只使用原始简历中明确存在的事实和量化数据；禁止编造公司、项目、职责、技能熟练度、业绩指标、学历或个人信息。
6. 优化依据仅是可选参考：提供时可用于内容取舍，未提供时直接根据原始简历和岗位信息完成，不要提示用户缺少优化依据。
7. 优先遵循用户自定义优化方向；未提供自定义方向时遵循默认方向。
8. 语言自然、专业、适合口述，避免逐段朗读简历。
9. 只输出自我介绍正文，不要标题、Markdown、代码块、字数说明或其他解释。`

function formatOptimizationBasis(basis?: OptimizationBasis): string {
  if (!basis) {
    return '未提供优化依据。请直接根据原始简历、目标公司、目标职位和岗位描述完成简历优化。'
  }

  return JSON.stringify(basis, null, 2)
}

function formatOptionalIntroductionBasis(basis?: OptimizationBasis): string {
  if (!basis) {
    return '未提供优化依据。本次请仅根据原始简历、目标公司、目标职位和岗位描述生成自我介绍。'
  }

  return JSON.stringify(basis, null, 2)
}

/**
 * 模板变量替换
 *
 * 将 analyze/generate request 的字段填入 Prompt 模板的 {placeholder} 中。
 * RAG 上下文通过 formatRagContext() 格式化为 Markdown 后注入。
 */
function fillTemplate(
  template: string,
  data: AnalyzeRequest | GenerateRequest | SelfIntroductionRequest,
): string {
  let result = template
    .replace('{resumeContent}', data.resumeContent)
    .replace('{companyName}', data.companyName)
    .replace('{jobTitle}', data.jobTitle)
    .replace('{jobDescription}', data.jobDescription)
    .replace('{companyInfo}', data.companyInfo || '未提供')
    .replace('{ragContext}', formatRagContext(data.rag))

  if ('direction' in data) {
    result = result
      .replace('{optimizationBasis}', formatOptionalIntroductionBasis(data.optimizationBasis))
      .replace('{selfIntroductionDirection}', formatSelfIntroductionDirection(data.direction))
  } else {
    result = result.replace(
      '{optimizationBasis}',
      'optimizationBasis' in data ? formatOptimizationBasis(data.optimizationBasis) : '',
    )
  }

  return result
}

/**
 * 通用 OpenAI 兼容 Chat Completion 调用
 *
 * 不依赖任何 SDK，直接用 fetch 调 REST API。
 * 兼容所有实现了 /chat/completions 端点的服务（DeepSeek / 阿里云百炼 / 自定义）。
 *
 * @param prompt      完整的 system-less prompt（作为 user message 发送）
 * @param temperature 温度参数：分析 0.4，生成 0.7
 * @returns           { success, content, error } 的通用响应格式
 */
async function callChatCompletion(prompt: string, temperature = 0.7): Promise<GenerateResponse> {
  const config = await db.aiConfig.get()

  if (!config.apiKey) {
    return {
      success: false,
      content: '',
      error: '请先在设置页面配置API Key',
    }
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature,
        stream: false, // 非流式，简化处理
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        content: '',
        error: `API请求失败 (${response.status}): ${errorText}`,
      }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    if (!content) {
      return {
        success: false,
        content: '',
        error: 'AI返回内容为空',
      }
    }

    return {
      success: true,
      content,
    }
  } catch (error) {
    return {
      success: false,
      content: '',
      error: error instanceof Error ? error.message : '未知错误',
    }
  }
}

/**
 * 清理 LLM 输出的 JSON
 *
 * LLM 经常在 JSON 外面包裹 ```json ... ``` 代码围栏，甚至只写 ```。
 * 此函数剥离所有可能的围栏标记，只保留纯 JSON 字符串。
 * 这是防御性解析的第一层。
 */
function cleanJsonContent(content: string): string {
  return content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

/**
 * 数组字段类型安全过滤
 *
 * 即使 LLM 声称返回的是数组，实际可能是字符串、null 或其他类型。
 * 此函数逐元素检查类型，确保调用方拿到的必定是 string[]。
 */
function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 优化依据规范化 —— 防御性解析的核心
 *
 * 设计原则：每个字段都有"保险"默认值。
 *   - fitSummary 为空 → 给出合理的降级文本
 *   - fitScore 非法 → 回退为 0
 *   - 数组字段类型不对 → 回退为空数组 []
 *
 * 这保证了即使 LLM 输出完全不可解析，
 * 后续的简历生成流程也不会因为 TypeError 而崩溃。
 */
function normalizeOptimizationBasis(value: unknown): OptimizationBasis {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const fitScore = Number(data.fitScore)

  const basis: OptimizationBasis = {
    fitSummary: typeof data.fitSummary === 'string' && data.fitSummary.trim()
      ? data.fitSummary.trim()
      : DEFAULT_BASIS.fitSummary,
    fitScore: Number.isFinite(fitScore) ? Math.min(100, Math.max(0, Math.round(fitScore))) : 0,
    matchedAdvantages: normalizeStringList(data.matchedAdvantages),
    weakPoints: normalizeStringList(data.weakPoints),
    transferableExperience: normalizeStringList(data.transferableExperience),
    keywordStrategy: normalizeStringList(data.keywordStrategy),
    rewriteStrategy: normalizeStringList(data.rewriteStrategy),
    riskNotes: normalizeStringList(data.riskNotes),
  }
  return basis
}

/**
 * JSON 解析 → 清理 → 规范化 的完整链路
 *
 * 三层防御：
 *   1. cleanJsonContent —— 剥离代码围栏
 *   2. JSON.parse —— 解析为 JS 对象
 *   3. normalizeOptimizationBasis —— 类型校验 + 默认值
 *
 * 任何一层失败都会抛出异常，由上层 analyzeResumeOptimizationBasis 统一捕获。
 */
function parseOptimizationBasis(content: string): OptimizationBasis {
  const parsed = JSON.parse(cleanJsonContent(content))
  return normalizeOptimizationBasis(parsed)
}

/**
 * 分析简历优化依据 —— Customize 工作流的 Step 1
 *
 * 完整流程：
 *   1. 拼接 Prompt（注入 RAG 上下文 + 简历 + JD + 公司信息）
 *   2. 调用 LLM（温度 0.4，要求结构化 JSON 输出）
 *   3. 防御性解析 LLM 输出
 *   4. 将 RAG 结果附加到 OptimizationBasis.rag（供前端展示 RAG 证据）
 *
 * 此函数在 Customize.vue 的「开始分析」按钮点击时调用。
 */
export async function analyzeResumeOptimizationBasis(
  request: AnalyzeRequest,
): Promise<AnalyzeResponse> {
  const prompt = fillTemplate(RESUME_ANALYSIS_PROMPT, request)
  const result = await callChatCompletion(prompt, 0.4)

  if (!result.success) {
    return {
      success: false,
      rawContent: result.content,
      error: result.error,
    }
  }

  try {
    const data = parseOptimizationBasis(result.content)
    data.rag = request.rag // 附加 RAG 结果到优化依据
    return {
      success: true,
      data,
      rawContent: result.content,
    }
  } catch {
    return {
      success: false,
      rawContent: result.content,
      error: '优化依据解析失败，请重新分析',
    }
  }
}

/**
 * 生成定向简历 —— Customize 工作流的 Step 2
 *
 * 与 analyze 不同，这里不解析 JSON，而是直接返回 Markdown 文本。
 * 温度 0.7 提供适度的表达灵活性，让简历文案更自然。
 *
 * 此函数在 Customize.vue 的「生成新简历」按钮点击时调用。
 */
export async function generateResume(request: GenerateRequest): Promise<GenerateResponse> {
  const prompt = fillTemplate(RESUME_GENERATION_PROMPT, request)
  return callChatCompletion(prompt, 0.7)
}

/** 独立生成岗位定向的两分钟内自我介绍。 */
export async function generateSelfIntroduction(
  request: SelfIntroductionRequest,
): Promise<GenerateResponse> {
  const prompt = fillTemplate(SELF_INTRODUCTION_PROMPT, request)
  return callChatCompletion(prompt, 0.65)
}

/**
 * 测试 AI 连接
 *
 * 发送一个最小 token 的请求，只判断 HTTP 状态码。
 * 不检查返回内容，只验证 API Key 和端点是否可达。
 */
export async function testAIConnection(config: AIConfig): Promise<boolean> {
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: '请回复"连接成功"' }],
        max_tokens: 20,
        stream: false,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}
