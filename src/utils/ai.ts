import type {
  AIConfig,
  AnalyzeRequest,
  AnalyzeResponse,
  GenerateRequest,
  GenerateResponse,
  OptimizationBasis,
} from '@/types'
import { aiConfigDb } from './db'

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

## 输出要求
1. 只输出 JSON，不要输出 Markdown，不要使用代码块，不要添加解释性文字。
2. fitScore 必须是 0-100 的数字。
3. 每个数组尽量控制在 2-4 条，语言具体、可执行。
4. 必须明确区分已有优势和缺少/较弱能力。
5. 不要编造原始简历中没有的公司、项目、学历、证书、技能熟练度。
6. 风险提示必须提醒哪些内容不能夸大或需要谨慎表达。

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

// 内置Workflow Prompt模板
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
7. 不新增虚假公司、项目、学历、证书、个人信息、量化成果；对缺少技能只能谨慎表达为“了解”“学习中”“相关接触”，不能写成精通

请直接输出纯Markdown格式的简历内容，不要使用代码块，直接输出内容即可，不要包含任何解释性文字。`

function formatOptimizationBasis(basis?: OptimizationBasis): string {
  if (!basis) {
    return '未提供优化依据。请直接根据原始简历、目标公司、目标职位和岗位描述完成简历优化。'
  }

  return JSON.stringify(basis, null, 2)
}

// 替换模板变量
function fillTemplate(template: string, data: AnalyzeRequest | GenerateRequest): string {
  return template
    .replace('{resumeContent}', data.resumeContent)
    .replace('{companyName}', data.companyName)
    .replace('{jobTitle}', data.jobTitle)
    .replace('{jobDescription}', data.jobDescription)
    .replace('{companyInfo}', data.companyInfo || '未提供')
    .replace(
      '{optimizationBasis}',
      'optimizationBasis' in data ? formatOptimizationBasis(data.optimizationBasis) : '',
    )
}

async function callChatCompletion(prompt: string, temperature = 0.7): Promise<GenerateResponse> {
  const config = aiConfigDb.get()

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
        stream: false,
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

function cleanJsonContent(content: string): string {
  return content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeOptimizationBasis(value: unknown): OptimizationBasis {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const fitScore = Number(data.fitScore)

  return {
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
}

function parseOptimizationBasis(content: string): OptimizationBasis {
  const parsed = JSON.parse(cleanJsonContent(content))
  return normalizeOptimizationBasis(parsed)
}

// 调用AI分析简历优化依据
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
    return {
      success: true,
      data: parseOptimizationBasis(result.content),
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

// 调用AI生成简历
export async function generateResume(request: GenerateRequest): Promise<GenerateResponse> {
  const prompt = fillTemplate(RESUME_GENERATION_PROMPT, request)
  return callChatCompletion(prompt, 0.7)
}

// 测试AI连接
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
