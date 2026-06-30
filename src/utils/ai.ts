import type { GenerateRequest, GenerateResponse, AIConfig } from '@/types'
import { aiConfigDb } from './db'

// 内置Workflow Prompt模板
const RESUME_GENERATION_PROMPT = `你是一位专业的简历优化专家。请严格按照以下格式重新定制简历，**不要**参考原始简历的格式。

## 输入信息

### 原始简历
{resumeContent}

### 目标岗位描述
{jobDescription}

### 目标公司信息
{companyInfo}

## 输出格式（必须严格遵守，逐字逐句匹配）

分割线必须放在每个模块标题的下一行。

\`\`\`markdown
# 姓名

电话：XXX | 邮箱：XXX | 性别：XXX | XX岁 | X年XX开发经验

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
4. 联系方式必须在同一行，用竖线"|"分隔
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
3. 使用量化数据
4. 语言专业精炼

请直接输出纯Markdown格式的简历内容，不要使用代码块，直接输出内容即可，不要包含任何解释性文字。`

// 替换模板变量
function fillTemplate(template: string, data: GenerateRequest): string {
  return template
    .replace('{resumeContent}', data.resumeContent)
    .replace('{jobDescription}', data.jobDescription)
    .replace('{companyInfo}', data.companyInfo)
}

// 调用AI生成简历
export async function generateResume(request: GenerateRequest): Promise<GenerateResponse> {
  const config = aiConfigDb.get()

  if (!config.apiKey) {
    return {
      success: false,
      content: '',
      error: '请先在设置页面配置API Key',
    }
  }

  const prompt = fillTemplate(RESUME_GENERATION_PROMPT, request)

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
        temperature: 0.7,
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
