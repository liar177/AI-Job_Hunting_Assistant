import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import { invokeTauri, isTauri } from './platform'

type DownloadResult = string | null | undefined

type PdfTextItem = {
  str: string
  transform: number[]
  width?: number
  height?: number
  fontName?: string
}

type PdfLine = {
  text: string
  x: number
  y: number
  width: number
  fontSize: number
  isBold: boolean
  page: number
}

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
  gfm: true,
})

// Markdown转HTML
export function renderMarkdown(content: string): string {
  return marked.parse(content) as string
}

export function cleanLegacyDocStyleNoiseFromMarkdown(content: string): string {
  return normalizeMarkdown(
    content
      .split(/\r?\n/)
      .filter((line) => !isLegacyDocStyleNoise(line))
      .join('\n')
  )
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain;charset=utf-8'
): Promise<DownloadResult> {
  if (isTauri()) {
    const path = await selectSavePath(filename)
    if (!path) return null
    return invokeTauri<string>('export_text_file', { path, content })
  }

  downloadBlob(content, filename, mimeType)
  return undefined
}

// 导出Markdown为文件
export async function downloadMarkdown(content: string, filename: string = 'resume.md'): Promise<DownloadResult> {
  return downloadFile(content, filename, 'text/markdown;charset=utf-8')
}

// 导出为文本文件
export async function downloadText(content: string, filename: string): Promise<DownloadResult> {
  return downloadFile(content, filename, 'text/plain;charset=utf-8')
}

export async function downloadPdf(
  content: string,
  filename: string = 'resume.pdf',
  title: string = '简历'
): Promise<DownloadResult> {
  if (isTauri()) {
    const path = await selectSavePath(filename, [{ name: 'PDF', extensions: ['pdf'] }])
    if (!path) return null
    return invokeTauri<string>('export_pdf_file', { path, title, content })
  }

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    throw new Error('无法打开 PDF 导出窗口，请检查浏览器弹窗设置')
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            margin: 0;
            padding: 32px 42px;
            color: #24292f;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif;
            font-size: 15px;
            line-height: 1.72;
          }
          h1, h2, h3, h4, h5, h6 {
            margin: 1.25em 0 0.6em;
            color: #111827;
            font-weight: 700;
            line-height: 1.28;
          }
          h1 { padding-bottom: 0.28em; border-bottom: 1px solid #e5e7eb; font-size: 2em; }
          h2 { padding-bottom: 0.22em; border-bottom: 1px solid #edf0f3; font-size: 1.6em; }
          h3 { font-size: 1.3em; }
          h4 { font-size: 1.12em; }
          h5 { font-size: 1em; }
          h6 { color: #6b7280; font-size: 0.9em; }
          p { margin: 0 0 1em; }
          ul, ol { margin: 0 0 1em; padding-left: 1.6em; }
          li { margin: 0.3em 0; }
          blockquote { margin: 1em 0; padding-left: 1em; border-left: 4px solid #d0d7de; color: #57606a; }
          code { padding: 0.15em 0.35em; border-radius: 4px; background: #f3f4f6; color: #be123c; }
          pre { padding: 14px; overflow-x: auto; border-radius: 8px; background: #f6f8fa; }
          pre code { padding: 0; background: transparent; color: inherit; }
          table { width: 100%; margin: 1em 0; border-collapse: collapse; }
          th, td { padding: 8px 10px; border: 1px solid #d0d7de; }
          th { background: #f6f8fa; }
          @page { margin: 18mm; }
        </style>
      </head>
      <body>${renderMarkdown(content)}</body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return undefined
}

async function selectSavePath(
  filename: string,
  filters: Array<{ name: string; extensions: string[] }> = [filterForFilename(filename)]
): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const selected = await save({
    defaultPath: sanitizeSuggestedFilename(filename),
    filters,
  })
  if (!selected) return null
  return ensurePathExtension(selected, extensionFromFilename(filename))
}

function filterForFilename(filename: string): { name: string; extensions: string[] } {
  const extension = extensionFromFilename(filename)
  if (!extension) return { name: '文件', extensions: [] }
  const names: Record<string, string> = {
    md: 'Markdown',
    markdown: 'Markdown',
    txt: 'TXT',
    json: 'JSON',
    pdf: 'PDF',
  }
  return { name: names[extension] || extension.toUpperCase(), extensions: [extension] }
}

function extensionFromFilename(filename: string): string {
  return filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''
}

function ensurePathExtension(path: string, extension: string): string {
  if (!extension) return path
  const filename = path.split(/[\\/]/).pop() || path
  if (new RegExp(`\\.${extension}$`, 'i').test(filename)) return path
  return `${path}.${extension}`
}

function sanitizeSuggestedFilename(filename: string): string {
  const sanitized = filename
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  return sanitized || 'export.txt'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
      convertToMarkdown(
        input: { arrayBuffer: ArrayBuffer },
        options?: Record<string, unknown>
      ): Promise<{ value: string }>
    }
    convertToMarkdown(
      input: { arrayBuffer: ArrayBuffer },
      options?: Record<string, unknown>
    ): Promise<{ value: string }>
  }
  const mammoth = mammothModule.default || mammothModule
  const arrayBuffer = await file.arrayBuffer()

  // DOCX keeps semantic paragraph styles. Map common Word styles to Markdown
  // headings, then let Mammoth preserve basic structures like lists and tables.
  const result = await mammoth.convertToMarkdown(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => p:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Heading 5'] => h5:fresh",
        "p[style-name='Heading 6'] => h6:fresh",
        "p[style-name='\\u6807\\u9898 1'] => h1:fresh",
        "p[style-name='\\u6807\\u9898 2'] => h2:fresh",
        "p[style-name='\\u6807\\u9898 3'] => h3:fresh",
        "p[style-name='\\u6807\\u9898 4'] => h4:fresh",
        "p[style-name='\\u6807\\u9898 5'] => h5:fresh",
        "p[style-name='\\u6807\\u9898 6'] => h6:fresh",
        "p[style-name='\\u6B63\\u6587'] => p:fresh",
        "p[style-name='标题 1'] => h1:fresh",
        "p[style-name='标题 2'] => h2:fresh",
        "p[style-name='标题 3'] => h3:fresh",
        "p[style-name='标题 4'] => h4:fresh",
        "p[style-name='标题 5'] => h5:fresh",
        "p[style-name='标题 6'] => h6:fresh",
        "p[style-name='正文'] => p:fresh",
        "p[style-name='Normal'] => p:fresh",
      ],
      includeDefaultStyleMap: true,
      ignoreEmptyParagraphs: true,
      convertImage: undefined,
    }
  )
  return normalizeMarkdown(result.value)
}

async function readLegacyDocFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  // Legacy .doc is a binary OLE document, unlike .docx. In the browser we do a
  // best-effort text recovery from common encodings, then structure it as Markdown.
  const utf16Text = extractLegacyDocContentBlocks(decodeBytes(bytes, 'utf-16le'))
  const fallbackTexts = [decodeBytes(bytes, 'gb18030'), decodeBytes(bytes, 'utf-8')].map(extractLegacyDocContentBlocks)
  const bestText = hasUsefulLegacyDocContent(utf16Text)
    ? utf16Text
    : fallbackTexts.sort((a, b) => scoreLegacyDocCandidate(b) - scoreLegacyDocCandidate(a))[0]

  return legacyDocTextToMarkdown(bestText)
}

async function readPdfFile(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const pdfWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default

  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const lines: PdfLine[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()

    // PDF exposes positioned text fragments, not headings or paragraphs.
    // First rebuild visual lines; later steps infer Markdown from geometry.
    lines.push(...buildPdfLines(textContent.items as PdfTextItem[], pageNumber))
  }

  return convertPdfLinesToMarkdown(lines)
}

function normalizeMarkdown(content: string): string {
  return content
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function decodeBytes(bytes: Uint8Array, encoding: string): string {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

function extractReadableDocText(text: string): string {
  const normalized = text
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '\n')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length < 2 || line.length > 160) return false
      if (isLegacyDocStyleNoise(line)) return false
      if (isLegacyDocBinaryNoise(line)) return false
      const readableChars = line.match(/[\u4E00-\u9FA5A-Za-z0-9，。；：、,.!?()（）/@#%+\-_\s]/g)?.length || 0
      return readableChars / line.length > 0.65
    })

  return Array.from(new Set(lines)).join('\n')
}

function extractLegacyDocContentBlocks(text: string): string {
  const blocks: string[][] = []
  let currentBlock: string[] = []

  const lines = text
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '\n')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (isUsefulLegacyDocContentLine(line)) {
      currentBlock.push(line)
      continue
    }

    if (currentBlock.length) {
      blocks.push(currentBlock)
      currentBlock = []
    }
  }

  if (currentBlock.length) {
    blocks.push(currentBlock)
  }

  return blocks
    .map((lines) => ({ lines, score: scoreLegacyDocBlock(lines) }))
    .filter((block) => block.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => lines.indexOf(a.lines[0]) - lines.indexOf(b.lines[0]))
    .flatMap((block) => block.lines)
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .join('\n')
}

function isUsefulLegacyDocContentLine(line: string): boolean {
  if (line.length < 2 || line.length > 160) return false
  if (isLegacyDocStyleNoise(line)) return false
  if (isLegacyDocBinaryNoise(line)) return false
  if (isLegacyDocFontOrMetadataLine(line)) return false

  const readableChars =
    line.match(/[\u4E00-\u9FA5A-Za-z0-9，。；：、,.!?()（）/@#%+\-_\s]/g)?.length || 0
  return readableChars / line.length > 0.65
}

function scoreLegacyDocBlock(lines: string[]): number {
  const text = lines.join('\n')
  const cjk = text.match(/[\u4E00-\u9FA5]/g)?.length || 0
  const digits = text.match(/\d/g)?.length || 0
  const punctuation = text.match(/[，。；：、,.!?！?]/g)?.length || 0
  return cjk * 2 + digits * 0.5 + punctuation * 1.5 + lines.length * 5 - text.length * 0.02
}

function isLegacyDocFontOrMetadataLine(line: string): boolean {
  const text = normalizeLegacyDocNoiseLine(line)
  if (/^(?:Times New Roman|Symbol|Arial|Cambria Math|DengXian|Unknown)$/i.test(text)) return true
  if (/^(?:等线|等线 Light)$/.test(text)) return true
  return false
}

function scoreReadableText(text: string): number {
  const chinese = text.match(/[\u4E00-\u9FA5]/g)?.length || 0
  const latin = text.match(/[A-Za-z]/g)?.length || 0
  const noisy = text.match(/[�]/g)?.length || 0
  return chinese * 2 + latin - noisy * 10 + text.length * 0.02
}

function scoreLegacyDocCandidate(text: string): number {
  const chinese = text.match(/[\u4E00-\u9FA5]/g)?.length || 0
  const latin = text.match(/[A-Za-z]/g)?.length || 0
  const noisy = text.match(/[\uFFFD]/g)?.length || 0
  const xmlNoise = text.match(/PK|Content_Types|_rels|theme\/|\.xml|Microsoft Office|WordDocument/g)?.length || 0
  const lines = text.split('\n').filter(Boolean)
  const usefulLines = lines.filter((line) => line.length <= 80 && !isLegacyDocBinaryNoise(line)).length
  return chinese * 2 + latin * 0.3 + usefulLines * 12 - noisy * 30 - xmlNoise * 80 - text.length * 0.04
}

function hasUsefulLegacyDocContent(text: string): boolean {
  const lines = text.split('\n').filter((line) => line.trim())
  const cjkCount = text.match(/[\u4E00-\u9FA5]/g)?.length || 0
  return cjkCount >= 8 && lines.length >= 2
}

function legacyDocTextToMarkdown(text: string): string {
  const markdown: string[] = []

  for (const rawLine of text.split('\n')) {
    const line = cleanPdfLineTextForMarkdown(rawLine)
    if (!line) continue
    if (isLegacyDocStyleNoise(line)) continue
    if (isLegacyDocBinaryNoise(line)) continue

    if (isPdfListItemForMarkdown(line)) {
      markdown.push(toMarkdownListItemForMarkdown(line))
    } else if (isResumeSectionTitle(line)) {
      pushBlank(markdown)
      markdown.push(`## ${line}`)
      pushBlank(markdown)
    } else {
      markdown.push(line)
    }
  }

  return normalizeMarkdown(markdown.join('\n'))
}

function isLegacyDocStyleNoise(line: string): boolean {
  const text = normalizeLegacyDocNoiseLine(line)
  const compactText = text.replace(/\s+/g, '')
  const exactStyleNames = new Set([
    '\u6B63\u6587',
    '\u6B63\u6587\u6587\u672C',
    '\u6807\u9898',
    '\u526F\u6807\u9898',
    '\u9ED8\u8BA4\u6BB5\u843D\u5B57\u4F53',
    '\u666E\u901A\u8868\u683C',
    '\u65E0\u5217\u8868',
    '\u9875\u7709',
    '\u9875\u811A',
    '\u76EE\u5F55',
    'Normal',
    'Title',
    'Subtitle',
    'Default Paragraph Font',
    'Table Normal',
    'No List',
    'Header',
    'Footer',
    'TOC Heading',
  ])

  if (exactStyleNames.has(text)) return true
  if (/^\u6807\u9898\d+(\u5B57\u7B26)?$/.test(compactText)) return true
  if (/^Heading\s*\d+(\s*Char)?$/i.test(text)) return true
  if (/^\u76EE\u5F55\d+$/.test(compactText)) return true
  if (/^TOC\s*\d+$/i.test(text)) return true
  if (/^\u9875\u7709\u5B57\u7B26$/.test(compactText)) return true
  if (/^\u9875\u811A\u5B57\u7B26$/.test(compactText)) return true
  if (isLegacyDocStyleCatalogName(compactText)) return true
  if (isLegacyDocStyleCatalogBlock(text)) return true
  return false
}

function isLegacyDocBinaryNoise(line: string): boolean {
  const text = normalizeLegacyDocNoiseLine(line)
  const compactText = text.replace(/\s+/g, '')

  if (
    /^(?:PK|_rels|theme\/|\[Content_Types\]|<\?xml|WordDocument|SummaryInformation|DocumentSummaryInformation|CompObj|Microsoft Office|KSOProductBuildVer|MSWordDoc|Word\.Document|Normal\.dotm|Data|1Table)/i.test(
      text
    )
  ) {
    return true
  }

  if (/[\uFFFD]/.test(text)) return true
  if (/[\u2E80-\u2FDF\u3400-\u4DBF]/.test(text)) return true
  // Some legacy .doc metadata bytes decode into stable CJK-looking mojibake.
  // These paired fragments come from Office package strings, not user content.
  if (/(楍牣|獯景|晏楦|圠牯|卋偏|潲畤|瑣畂|汩噤|噤牥)/.test(text)) return true
  if (/[A-Za-z0-9_\/\\<>]{4,}/.test(text) && /[\u4E00-\u9FA5]/.test(text) && compactText.length > 12) {
    return true
  }

  const readableChars =
    text.match(/[\u4E00-\u9FA5A-Za-z0-9，。；：、,.!?()（）/@#%+\-_\s]/g)?.length || 0
  return readableChars / Math.max(text.length, 1) < 0.72
}

function normalizeLegacyDocNoiseLine(line: string): string {
  return line
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isLegacyDocStyleCatalogName(compactText: string): boolean {
  if (compactText.length > 28) return false

  return /^(?:\u6B63\u6587|\u6807\u9898|\u526F\u6807\u9898|\u9ED8\u8BA4\u6BB5\u843D\u5B57\u4F53|\u666E\u901A\u8868\u683C|\u65E0\u5217\u8868|\u9875\u7709|\u9875\u811A|\u76EE\u5F55|\u6279\u6CE8|\u5C3E\u6CE8|\u811A\u6CE8|\u8D85\u94FE\u63A5|\u5DF2\u8BBF\u95EE\u7684\u8D85\u94FE\u63A5|\u5217\u8868|\u6C14\u7403|\u4FEE\u8BA2|HTML)/.test(
    compactText
  )
}

function isLegacyDocStyleCatalogBlock(text: string): boolean {
  if (text.length > 180) return false
  const matches =
    text.match(
      /\u6B63\u6587|\u6807\u9898\s*\d*(?:\s*\u5B57\u7B26)?|\u666E\u901A\u8868\u683C|\u65E0\u5217\u8868|\u9ED8\u8BA4\u6BB5\u843D\u5B57\u4F53|\u9875\u7709|\u9875\u811A|\u76EE\u5F55\s*\d*|Heading\s*\d*(?:\s*Char)?|Normal|No List|Table Normal/g
    ) || []

  return matches.length >= 3
}

function buildPdfLines(items: PdfTextItem[], page: number): PdfLine[] {
  // Extract the minimum geometry needed for layout inference: x/y position,
  // approximate width, font size, and a best-effort bold signal.
  const words = items
    .map((item) => {
      const text = item.str.replace(/\s+/g, ' ').trim()
      if (!text) return null
      const transform = item.transform || []
      const x = transform[4] || 0
      const y = transform[5] || 0
      const fontSize = Math.abs(transform[3] || item.height || 10)
      return {
        text,
        x,
        y,
        width: item.width || text.length * fontSize * 0.5,
        fontSize,
        isBold: /bold|black|heavy|medium/i.test(item.fontName || ''),
        page,
      }
    })
    .filter((item): item is PdfLine => Boolean(item))
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page
      if (Math.abs(a.y - b.y) > 2) return b.y - a.y
      return a.x - b.x
    })

  const lines: PdfLine[] = []

  for (const word of words) {
    const last = lines[lines.length - 1]
    const sameLine =
      last &&
      last.page === word.page &&
      Math.abs(last.y - word.y) <= Math.max(2.5, Math.min(last.fontSize, word.fontSize) * 0.35)

    if (!sameLine) {
      lines.push({ ...word })
      continue
    }

    // Items with nearly identical Y coordinates are part of the same visual
    // line. A larger X gap becomes a normal space between words/phrases.
    const gap = word.x - (last.x + last.width)
    const separator = gap > Math.max(last.fontSize * 0.55, 5) ? ' ' : ''
    last.text = `${last.text}${separator}${word.text}`.replace(/\s+/g, ' ').trim()
    last.width = Math.max(last.width, word.x + word.width - last.x)
    last.fontSize = Math.max(last.fontSize, word.fontSize)
    last.isBold = last.isBold || word.isBold
  }

  return sortPdfLinesForReading(lines.filter((line) => line.text))
}

function convertPdfLinesToMarkdown(lines: PdfLine[]): string {
  if (!lines.length) return ''

  const fontSizes = lines.map((line) => line.fontSize).sort((a, b) => a - b)
  const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 10
  const largeFontSize = Math.max(medianFontSize * 1.18, medianFontSize + 1.5)
  const maxFontSize = Math.max(...fontSizes)
  const markdown: string[] = []
  let previous: PdfLine | null = null

  for (const line of lines) {
    const text = cleanPdfLineTextForMarkdown(line.text)
    if (!text) continue

    if (previous && shouldInsertParagraphBreak(previous, line, medianFontSize)) {
      pushBlank(markdown)
    }

    if (isPdfListItemForMarkdown(text)) {
      markdown.push(toMarkdownListItemForMarkdown(text))
    } else if (isLikelyPdfHeading(line, text, medianFontSize, largeFontSize, maxFontSize)) {
      // Heading detection is heuristic because PDFs do not expose heading tags:
      // larger fonts, bold text, and short resume section names become headings.
      pushBlank(markdown)
      markdown.push(`${headingPrefix(line.fontSize, maxFontSize, largeFontSize)} ${text}`)
      pushBlank(markdown)
    } else if (shouldMergeWithPreviousParagraph(markdown, previous, line, text, medianFontSize)) {
      markdown[markdown.length - 1] = `${markdown[markdown.length - 1]} ${text}`.replace(/\s+/g, ' ')
    } else {
      markdown.push(text)
    }

    previous = line
  }

  return normalizeMarkdown(markdown.join('\n'))
}

function sortPdfLinesForReading(lines: PdfLine[]): PdfLine[] {
  const pages = new Map<number, PdfLine[]>()
  for (const line of lines) {
    const pageLines = pages.get(line.page) || []
    pageLines.push(line)
    pages.set(line.page, pageLines)
  }

  return Array.from(pages.entries())
    .sort(([a], [b]) => a - b)
    .flatMap(([, pageLines]) => {
      const minX = Math.min(...pageLines.map((line) => line.x))
      const maxX = Math.max(...pageLines.map((line) => line.x + line.width))
      const pageWidth = maxX - minX
      const splitX = minX + pageWidth * 0.46
      const leftLines = pageLines.filter((line) => line.x < splitX)
      const rightLines = pageLines.filter((line) => line.x >= splitX)
      const hasTwoColumns =
        leftLines.length >= 4 &&
        rightLines.length >= 4 &&
        Math.min(leftLines.length, rightLines.length) / pageLines.length > 0.22

      // Many resumes use a two-column layout. If both columns are substantial,
      // read the left column top-to-bottom before the right column.
      if (!hasTwoColumns) {
        return sortLinesTopToBottom(pageLines)
      }

      return [...sortLinesTopToBottom(leftLines), ...sortLinesTopToBottom(rightLines)]
    })
}

function sortLinesTopToBottom(lines: PdfLine[]): PdfLine[] {
  return [...lines].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 2) return b.y - a.y
    return a.x - b.x
  })
}

function cleanPdfLineText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[|｜]\s*/, '')
    .replace(/\s*[|｜]$/, '')
    .trim()
}

function shouldInsertParagraphBreak(previous: PdfLine, current: PdfLine, medianFontSize: number): boolean {
  if (previous.page !== current.page) return true
  const verticalGap = previous.y - current.y
  const columnJump = current.x < previous.x - 40 || current.x > previous.x + previous.width + 80
  return verticalGap > medianFontSize * 1.9 || columnJump
}

function isPdfListItem(text: string): boolean {
  return /^([•·●◦▪▫-]|\d+[.)、]|[a-zA-Z][.)])\s+/.test(text)
}

function toMarkdownListItem(text: string): string {
  return text.replace(/^([•·●◦▪▫-]|\d+[.)、]|[a-zA-Z][.)])\s+/, '- ')
}

function cleanPdfLineTextForMarkdown(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[|\uFF5C]\s*/, '')
    .replace(/\s*[|\uFF5C]$/, '')
    .trim()
}

function isPdfListItemForMarkdown(text: string): boolean {
  return /^([\u2022\u00B7\u25CF\u25E6\u25AA\u25AB-]|\d+[.)\u3001]|[a-zA-Z][.)])\s+/.test(text)
}

function toMarkdownListItemForMarkdown(text: string): string {
  return text.replace(/^([\u2022\u00B7\u25CF\u25E6\u25AA\u25AB-]|\d+[.)\u3001]|[a-zA-Z][.)])\s+/, '- ')
}

function endsWithSentencePunctuation(text: string): boolean {
  return /[,，。；;.!！？?]$/.test(text)
}

function isResumeSectionTitle(text: string): boolean {
  return (
    text.length <= 18 &&
    /^(?:\u4E2A\u4EBA|\u6C42\u804C|\u6559\u80B2|\u5DE5\u4F5C|\u9879\u76EE|\u5B9E\u4E60|\u6821\u56ED|\u4E13\u4E1A|\u6280\u80FD|\u8BC1\u4E66|\u5956\u9879|\u8363\u8A89|\u81EA\u6211|\u8054\u7CFB\u65B9\u5F0F|\u4E2A\u4EBA\u4FE1\u606F|\u6559\u80B2\u80CC\u666F|\u5DE5\u4F5C\u7ECF\u5386|\u9879\u76EE\u7ECF\u5386|\u5B9E\u4E60\u7ECF\u5386|\u4E13\u4E1A\u6280\u80FD|\u6280\u80FD\u7279\u957F|\u81EA\u6211\u8BC4\u4EF7|\u6C42\u804C\u610F\u5411)/.test(text)
  )
}

function isLikelyPdfHeading(
  line: PdfLine,
  text: string,
  medianFontSize: number,
  largeFontSize: number,
  maxFontSize: number
): boolean {
  if (isPdfListItemForMarkdown(text)) return false
  if (text.length > 36 && line.fontSize < maxFontSize * 0.98) return false
  if (endsWithSentencePunctuation(text)) return false
  if (/[,，。；;]$/.test(text)) return false

  const looksLikeSectionTitle =
    text.length <= 18 &&
    /^(个人|求职|教育|工作|项目|实习|校园|专业|技能|证书|奖项|荣誉|自我|联系方式|个人信息|教育背景|工作经历|项目经历|实习经历|专业技能|技能特长|自我评价|求职意向)/.test(text)

  return (
    line.fontSize >= largeFontSize ||
    line.isBold ||
    looksLikeSectionTitle ||
    isResumeSectionTitle(text) ||
    line.fontSize >= maxFontSize * 0.98
  )
}

function headingPrefix(fontSize: number, maxFontSize: number, largeFontSize: number): string {
  if (fontSize >= maxFontSize * 0.98) return '#'
  if (fontSize >= largeFontSize * 1.12) return '##'
  return '###'
}

function shouldMergeWithPreviousParagraph(
  markdown: string[],
  previous: PdfLine | null,
  current: PdfLine,
  text: string,
  medianFontSize: number
): boolean {
  if (!previous || !markdown.length) return false
  const last = markdown[markdown.length - 1]
  if (!last || last.startsWith('#') || last.startsWith('- ')) return false
  if (isPdfListItemForMarkdown(text)) return false
  if (previous.page !== current.page) return false
  if (Math.abs(previous.x - current.x) > 12) return false
  if (previous.y - current.y > medianFontSize * 1.45) return false
  return !/[。！？.!?：:]$/.test(last)
}

function pushBlank(lines: string[]) {
  if (lines.length && lines[lines.length - 1] !== '') {
    lines.push('')
  }
}

export async function readFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'doc') {
    return readLegacyDocFile(file)
  }

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
