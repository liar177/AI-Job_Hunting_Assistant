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
export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}
