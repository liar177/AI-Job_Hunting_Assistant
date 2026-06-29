import type { GenerateRequest, GenerateResponse, AIConfig } from '@/types'
import { aiConfigDb } from './db'

// 内置Workflow Prompt模板
const RESUME_GENERATION_PROMPT = `你是一位专业的简历优化专家。请根据以下信息，重新定制一份针对性的简历。

## 原始简历
{resumeContent}

## 目标岗位描述
{jobDescription}

## 目标公司信息
{companyInfo}

## 要求
1. 根据岗位描述的关键词和要求，调整简历内容的重点和顺序
2. 突出与目标岗位匹配的技能和经验
3. 优化语言表达，使其更专业、精炼
4. 保持简历的真实性，不编造经历
5. 输出Markdown格式的简历内容
6. 包含以下部分（如原始简历中有）：个人简介、工作经历、项目经验、技能特长、教育背景

请直接输出优化后的简历内容，使用Markdown格式。`

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
