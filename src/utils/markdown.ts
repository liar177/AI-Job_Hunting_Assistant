import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

// 配置marked - 使用自定义renderer处理代码高亮
const renderer = new marked.Renderer()
renderer.code = function (code: string, lang: string): string {
  let highlighted: string
  if (lang && hljs.getLanguage(lang)) {
    highlighted = hljs.highlight(code, { language: lang }).value
  } else {
    highlighted = hljs.highlightAuto(code).value
  }
  return `<pre><code class="hljs">${highlighted}</code></pre>`
}

marked.setOptions({
  renderer,
  breaks: true,
})

// Markdown转HTML
export function renderMarkdown(content: string): string {
  return marked.parse(content) as string
}

// 导出Markdown为文件
export function downloadMarkdown(content: string, filename: string = 'resume.md') {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// 导出为文本文件
export function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// 读取文件内容
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

async function readDocxFile(file: File): Promise<string> {
  const mammothModule = (await import('mammoth')) as unknown as {
    default?: {
      convertToMarkdown(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>
    }
    convertToMarkdown(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>
  }
  const mammoth = mammothModule.default || mammothModule
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToMarkdown({ arrayBuffer })
  return result.value.trim()
}

async function readPdfFile(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const pdfWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default

  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (pageText) {
      pages.push(pageText)
    }
  }

  return pages.join('\n\n').trim()
}

export async function readFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'docx') {
    return readDocxFile(file)
  }

  if (extension === 'pdf') {
    return readPdfFile(file)
  }

  if (extension === 'md' || extension === 'markdown' || extension === 'txt') {
    return readTextFile(file)
  }

  throw new Error('Unsupported file type')
}
