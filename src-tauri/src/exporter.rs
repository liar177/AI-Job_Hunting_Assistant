// PDF 导出器 —— 使用 printpdf + pulldown_cmark 的专业 PDF 生成
//
// 升级要点（相比之前的手动 PDF 构建）：
//   1. printpdf 库：专业的 PDF 生成，支持真正的字体嵌入和文本布局
//   2. pulldown_cmark：标准 Markdown 解析器，正确处理嵌套格式（加粗+斜体）
//   3. 系统字体自动发现：在 Windows/Fonts 目录查找 CJK 字体
//   4. 粗体/正文字体分离：标题和列表标记使用粗体字体（如 Dengb.ttf）
//   5. 精确的字符宽度估算：CJK 字符 ≈ 0.98 × fontSize，ASCII ≈ 0.56 × fontSize
//
// 架构流程：
//   Markdown 文本
//     → pulldown_cmark 解析为事件流
//       → 构建 PdfBlock 列表（Heading/Paragraph/ListItem/CodeBlock）
//         → PdfWriter 逐个渲染（wrap_spans 自动换行 + ensure_space 自动分页）
//           → printpdf 写出 PDF 字节

use std::{
    fs,
    path::{Path, PathBuf},
};

use printpdf::{
    Color, FontId, Mm, Op, ParsedFont, PdfDocument, PdfFontHandle, PdfPage, PdfSaveOptions, Point,
    Pt, Rgb, TextItem,
};
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

// ===== 页面布局常量 =====

const A4_WIDTH_MM: f32 = 210.0;
const A4_HEIGHT_MM: f32 = 297.0;
const A4_WIDTH_PT: f32 = 595.28;  // A4 宽度（1pt = 1/72 inch）
const A4_HEIGHT_PT: f32 = 841.89;
const PAGE_MARGIN_X: f32 = 56.0;   // 左右页边距
const PAGE_MARGIN_TOP: f32 = 58.0;
const PAGE_MARGIN_BOTTOM: f32 = 54.0;
const LIST_BODY_INDENT: f32 = 18.0; // 列表内容缩进（每级）

/// PDF 文本片段 —— 最小渲染单元
///
/// 每个片段有独立的 bold/code 标记，对应不同的字体和样式。
/// 与 pulldown_cmark 的 Event::Text/Code 对应。
#[derive(Debug, Clone, PartialEq)]
struct TextSpan {
    text: String,
    bold: bool,
    code: bool,
}

/// PDF 块 —— Markdown 的结构化表示
///
/// 每个 PdfBlock 对应 Markdown 的一个块级元素。
/// 渲染时每种类型有不同的样式（字号、行高、间距）。
#[derive(Debug, Clone, PartialEq)]
enum PdfBlock {
    Heading { level: u8, spans: Vec<TextSpan> },
    Paragraph { spans: Vec<TextSpan> },
    ListItem { marker: String, indent: usize, spans: Vec<TextSpan> },
    CodeBlock(String),
    Spacer, // 分隔线 ←
}

/// 文本样式 —— 控制渲染时的字体大小、行高和段间距
#[derive(Debug, Clone, Copy)]
struct TextStyle {
    font_size: f32,
    line_height: f32,
    before: f32,  // 段前间距
    after: f32,   // 段后间距
    bold: bool,   // 整行使用粗体（如标题）
}

/// 换行后的行 —— 排版引擎的输出单元
///
/// indent 控制左缩进（列表项用），spans 是此行内的文本片段序列。
#[derive(Debug, Clone)]
struct WrappedLine {
    indent: f32,
    spans: Vec<TextSpan>,
}

/// 列表状态（用于有序列表的序号递增）
#[derive(Debug, Clone)]
struct ListState {
    ordered: bool,
    next: u64, // 下一个序号
}

/// 字体资源 —— 正文 + 粗体两个字体 ID
struct PdfFonts {
    normal: FontId,
    bold: FontId,
}

/// PDF 写入器 —— 核心渲染引擎
///
/// 管理页面列表、当前页的绘制操作、当前 Y 坐标。
/// 自动分页（ensure_space 检测 Y 是否触底）。
struct PdfWriter {
    pages: Vec<PdfPage>,
    ops: Vec<Op>,          // 当前页的绘制操作
    y: f32,                // 当前 Y 坐标（从页面顶部向下）
    fonts: PdfFonts,
}

// ===== 公开导出 API =====

pub fn save_text_file(path: &str, content: &str) -> Result<String, String> {
    let path = validate_export_path(path)?;
    fs::write(&path, content.as_bytes()).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// 导出 PDF 文件
///
/// 完整流程：
///   1. 加载系统字体（正文字体 + 粗体字体）
///   2. Markdown → PdfBlock 列表
///   3. PdfWriter 渲染 → PdfPage 列表
///   4. printpdf 写出 PDF 字节
pub fn save_pdf_file(path: &str, title: &str, content: &str) -> Result<String, String> {
    let path = validate_export_path(path)?;
    let pdf = build_styled_pdf(title, content)?;
    fs::write(&path, pdf).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn validate_export_path(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if path.as_os_str().is_empty() {
        return Err("请选择保存位置".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
    }
    Ok(path.to_path_buf())
}

// ===== PDF 文档构建 =====

fn build_styled_pdf(title: &str, content: &str) -> Result<Vec<u8>, String> {
    let mut doc = PdfDocument::new(if title.trim().is_empty() {
        "resume"
    } else {
        title.trim()
    });
    // 加载字体：粗体加载失败时降级使用正文字体
    let normal_font = load_font(&normal_font_candidates())?;
    let bold_font = load_font(&bold_font_candidates()).unwrap_or_else(|_| normal_font.clone());
    let fonts = PdfFonts {
        normal: doc.add_font(&normal_font),
        bold: doc.add_font(&bold_font),
    };

    let blocks = markdown_to_pdf_blocks(title, content);
    let mut writer = PdfWriter::new(fonts);
    writer.render_blocks(&blocks);
    let pages = writer.finish();
    doc.with_pages(pages);

    let mut warnings = Vec::new();
    Ok(doc.save(&PdfSaveOptions::default(), &mut warnings))
}

/// 加载字体文件
///
/// 按候选列表顺序尝试，找到第一个存在的字体文件后解析。
/// 全部失败时返回详细错误信息（包含所有尝试过的路径和失败原因）。
fn load_font(candidates: &[PathBuf]) -> Result<ParsedFont, String> {
    let mut parse_errors = Vec::new();

    for path in candidates {
        if !path.exists() {
            continue;
        }
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(err) => {
                parse_errors.push(format!("{}: {err}", path.display()));
                continue;
            }
        };
        let mut warnings = Vec::new();
        if let Some(font) = ParsedFont::from_bytes(&bytes, 0, &mut warnings) {
            return Ok(font);
        }
        parse_errors.push(format!("{}: 字体解析失败", path.display()));
    }

    Err(format!(
        "没有找到可用于 PDF 导出的中文字体。已尝试：{}{}",
        candidates
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>()
            .join("、"),
        if parse_errors.is_empty() {
            String::new()
        } else {
            format!("；{}", parse_errors.join("；"))
        }
    ))
}

/// 正文字体候选列表（按优先级）
/// DengXian（等线）是 Windows 10+ 默认中文字体，优先使用
fn normal_font_candidates() -> Vec<PathBuf> {
    font_paths(&["Deng.ttf", "msyh.ttc", "simsun.ttc", "simhei.ttf"])
}

/// 粗体字体候选列表
/// Dengb.ttf 是等线的粗体变体，如果找不到则降级使用正文字体
fn bold_font_candidates() -> Vec<PathBuf> {
    font_paths(&[
        "Dengb.ttf",
        "msyhbd.ttc",
        "simsunb.ttf",
        "simhei.ttf",
        "Deng.ttf",       // 最后降级：用正文字体替代粗体
    ])
}

/// 在 Windows/Fonts 目录下查找字体文件
fn font_paths(names: &[&str]) -> Vec<PathBuf> {
    let windows_dir = std::env::var_os("WINDIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    names
        .iter()
        .map(|name| windows_dir.join("Fonts").join(name))
        .collect()
}

// ===== Markdown 解析 → PdfBlock =====

/// 将 Markdown 文本解析为 PdfBlock 列表
///
/// 使用 pulldown_cmark 作为标准 Markdown 解析器，支持：
///   - 多级标题（H1-H6）
///   - 段落 + 内联格式（加粗/代码）
///   - 有序/无序列表 + 嵌套
///   - 代码块
///   - 分隔线
///   - 任务列表
///   - 软/硬换行
fn markdown_to_pdf_blocks(title: &str, content: &str) -> Vec<PdfBlock> {
    let mut blocks = Vec::new();
    let clean_title = title.trim();
    if !clean_title.is_empty() {
        blocks.push(PdfBlock::Heading {
            level: 1,
            spans: vec![TextSpan::normal(clean_title)],
        });
    }

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(content, options);
    let mut current: Option<PdfBlock> = None;
    let mut list_stack: Vec<ListState> = Vec::new();
    let mut strong_depth = 0usize;           // 跟踪加粗嵌套深度
    let mut code_block: Option<String> = None;

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                current = Some(PdfBlock::Heading {
                    level: heading_level(level),
                    spans: Vec::new(),
                });
            }
            Event::End(TagEnd::Heading(_)) => push_current_block(&mut blocks, &mut current),
            Event::Start(Tag::Paragraph) => {
                if current.is_none() {
                    current = Some(PdfBlock::Paragraph { spans: Vec::new() });
                }
            }
            Event::End(TagEnd::Paragraph) => {
                if matches!(current, Some(PdfBlock::Paragraph { .. })) {
                    push_current_block(&mut blocks, &mut current);
                }
            }
            Event::Start(Tag::List(start)) => {
                list_stack.push(ListState {
                    ordered: start.is_some(),
                    next: start.unwrap_or(1),
                });
            }
            Event::End(TagEnd::List(_)) => {
                list_stack.pop();
            }
            Event::Start(Tag::Item) => {
                let depth = list_stack.len().saturating_sub(1);
                let marker = if let Some(state) = list_stack.last() {
                    if state.ordered {
                        format!("{}.", state.next)
                    } else {
                        "•".to_string()
                    }
                } else {
                    "•".to_string()
                };
                current = Some(PdfBlock::ListItem {
                    marker,
                    indent: depth,
                    spans: Vec::new(),
                });
            }
            Event::End(TagEnd::Item) => {
                push_current_block(&mut blocks, &mut current);
                if let Some(state) = list_stack.last_mut() {
                    if state.ordered {
                        state.next += 1; // 有序列表序号递增
                    }
                }
            }
            Event::Start(Tag::Strong) => strong_depth += 1,
            Event::End(TagEnd::Strong) => strong_depth = strong_depth.saturating_sub(1),
            Event::Start(Tag::CodeBlock(_)) => {
                code_block = Some(String::new());
            }
            Event::End(TagEnd::CodeBlock) => {
                if let Some(code) = code_block.take() {
                    blocks.push(PdfBlock::CodeBlock(code.trim_end().to_string()));
                }
            }
            Event::Text(text) => {
                if let Some(code) = code_block.as_mut() {
                    code.push_str(&text);
                } else {
                    push_span(&mut current, TextSpan::new(&text, strong_depth > 0, false));
                }
            }
            Event::Code(text) => {
                push_span(&mut current, TextSpan::new(&text, strong_depth > 0, true))
            }
            Event::SoftBreak => push_span(&mut current, TextSpan::normal(" ")),
            Event::HardBreak => push_span(&mut current, TextSpan::normal("\n")),
            Event::Rule => blocks.push(PdfBlock::Spacer),
            Event::TaskListMarker(checked) => {
                push_span(
                    &mut current,
                    TextSpan::normal(if checked { "[x] " } else { "[ ] " }),
                );
            }
            _ => {}
        }
    }

    push_current_block(&mut blocks, &mut current);
    if blocks.is_empty() {
        blocks.push(PdfBlock::Paragraph {
            spans: vec![TextSpan::normal("")],
        });
    }
    blocks
}

fn push_current_block(blocks: &mut Vec<PdfBlock>, current: &mut Option<PdfBlock>) {
    if let Some(block) = current.take() {
        if !block_is_empty(&block) {
            blocks.push(block);
        }
    }
}

/// 检查块是否为空（所有 spans 的文本都是空白或为空）
fn block_is_empty(block: &PdfBlock) -> bool {
    match block {
        PdfBlock::Heading { spans, .. }
        | PdfBlock::Paragraph { spans }
        | PdfBlock::ListItem { spans, .. } => spans.iter().all(|span| span.text.trim().is_empty()),
        PdfBlock::CodeBlock(code) => code.trim().is_empty(),
        PdfBlock::Spacer => false,
    }
}

/// 向当前块添加文本片段
///
/// 智能合并：如果相邻片段有相同的 bold/code 属性，直接拼接到上一个片段的 text，
/// 减少 PDF 绘制时的字体切换次数。
fn push_span(current: &mut Option<PdfBlock>, span: TextSpan) {
    if current.is_none() {
        *current = Some(PdfBlock::Paragraph { spans: Vec::new() });
    }

    let spans = match current.as_mut().expect("current block initialized") {
        PdfBlock::Heading { spans, .. } => spans,
        PdfBlock::Paragraph { spans } => spans,
        PdfBlock::ListItem { spans, .. } => spans,
        PdfBlock::CodeBlock(_) | PdfBlock::Spacer => return,
    };

    if let Some(last) = spans.last_mut() {
        if last.bold == span.bold && last.code == span.code {
            last.text.push_str(&span.text); // 合并相邻同属性片段
            return;
        }
    }
    spans.push(span);
}

fn heading_level(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

// ===== TextSpan 辅助方法 =====

impl TextSpan {
    fn normal(text: &str) -> Self {
        Self::new(text, false, false)
    }

    fn new(text: &str, bold: bool, code: bool) -> Self {
        Self {
            text: text.to_string(),
            bold,
            code,
        }
    }
}

// ===== PdfWriter 渲染引擎 =====

impl PdfWriter {
    fn new(fonts: PdfFonts) -> Self {
        Self {
            pages: Vec::new(),
            ops: Vec::new(),
            y: A4_HEIGHT_PT - PAGE_MARGIN_TOP, // 从页面顶部开始
            fonts,
        }
    }

    /// 渲染所有块
    fn render_blocks(&mut self, blocks: &[PdfBlock]) {
        for block in blocks {
            match block {
                PdfBlock::Heading { level, spans } => self.render_heading(*level, spans),
                PdfBlock::Paragraph { spans } => self.render_paragraph(spans),
                PdfBlock::ListItem { marker, indent, spans } => self.render_list_item(marker, *indent, spans),
                PdfBlock::CodeBlock(code) => self.render_code_block(code),
                PdfBlock::Spacer => self.add_vertical_space(10.0),
            }
        }
    }

    fn render_heading(&mut self, level: u8, spans: &[TextSpan]) {
        let style = heading_style(level);
        self.add_vertical_space(style.before);
        let lines = wrap_spans(spans, content_width(), content_width(), style, 0.0, 0.0);
        for line in lines {
            self.draw_wrapped_line(&line, style);
        }
        self.add_vertical_space(style.after);
    }

    fn render_paragraph(&mut self, spans: &[TextSpan]) {
        let style = paragraph_style();
        self.add_vertical_space(style.before);
        let lines = wrap_spans(spans, content_width(), content_width(), style, 0.0, 0.0);
        for line in lines {
            self.draw_wrapped_line(&line, style);
        }
        self.add_vertical_space(style.after);
    }

    /// 渲染列表项
    ///
    /// 第一行包含 marker（如 "•" 或 "1."），后续行缩进 LIST_BODY_INDENT。
    /// marker 强制使用粗体。
    fn render_list_item(&mut self, marker: &str, indent_level: usize, spans: &[TextSpan]) {
        let style = paragraph_style();
        let indent = indent_level as f32 * LIST_BODY_INDENT;
        let first_indent = indent;
        let later_indent = indent + LIST_BODY_INDENT;
        let mut item_spans = vec![TextSpan::new(&format!("{marker} "), true, false)];
        item_spans.extend_from_slice(spans);
        let lines = wrap_spans(
            &item_spans,
            content_width() - first_indent,
            content_width() - later_indent,
            style,
            first_indent,
            later_indent,
        );
        for line in lines {
            self.draw_wrapped_line(&line, style);
        }
        self.add_vertical_space(2.0);
    }

    fn render_code_block(&mut self, code: &str) {
        let style = code_style();
        self.add_vertical_space(style.before);
        for raw_line in code.lines() {
            let spans = vec![TextSpan::new(raw_line, false, true)];
            let lines = wrap_spans(&spans, content_width(), content_width(), style, 0.0, 0.0);
            for line in lines {
                self.draw_wrapped_line(&line, style);
            }
        }
        self.add_vertical_space(style.after);
    }

    /// 将一行绘制到当前页面
    ///
    /// 按片段混排：正文片段用 normal 字体，bold/code 片段用 bold 字体。
    /// 同属性相邻片段已在上游合并（push_span），减少了字体切换次数。
    fn draw_wrapped_line(&mut self, line: &WrappedLine, style: TextStyle) {
        self.ensure_space(style.line_height);
        self.ops.push(Op::StartTextSection);
        self.ops.push(Op::SetTextCursor {
            pos: Point {
                x: Pt(PAGE_MARGIN_X + line.indent),
                y: Pt(self.y),
            },
        });
        self.ops.push(Op::SetLineHeight {
            lh: Pt(style.line_height),
        });
        self.ops.push(Op::SetFillColor { col: text_color() });
        self.ops.push(Op::SetCharacterSpacing { multiplier: 0.0 });
        self.ops.push(Op::SetWordSpacing { pt: Pt(0.0) });

        for span in &line.spans {
            if span.text.is_empty() {
                continue;
            }
            let font = if style.bold || span.bold {
                self.fonts.bold.clone()
            } else {
                self.fonts.normal.clone()
            };
            self.ops.push(Op::SetFont {
                font: PdfFontHandle::External(font),
                size: Pt(style.font_size),
            });
            self.ops.push(Op::ShowText {
                items: vec![TextItem::Text(span.text.clone())],
            });
        }

        self.ops.push(Op::EndTextSection);
        self.y -= style.line_height;
    }

    fn add_vertical_space(&mut self, amount: f32) {
        if amount <= 0.0 {
            return;
        }
        self.ensure_space(amount);
        self.y -= amount;
    }

    /// 自动分页：如果剩余空间不足，完成当前页并开始新页
    fn ensure_space(&mut self, height: f32) {
        if self.y - height < PAGE_MARGIN_BOTTOM {
            self.finish_current_page();
        }
    }

    fn finish_current_page(&mut self) {
        if self.ops.is_empty() {
            self.y = A4_HEIGHT_PT - PAGE_MARGIN_TOP;
            return;
        }
        let ops = std::mem::take(&mut self.ops);
        self.pages
            .push(PdfPage::new(Mm(A4_WIDTH_MM), Mm(A4_HEIGHT_MM), ops));
        self.y = A4_HEIGHT_PT - PAGE_MARGIN_TOP;
    }

    fn finish(mut self) -> Vec<PdfPage> {
        self.finish_current_page();
        if self.pages.is_empty() {
            self.pages
                .push(PdfPage::new(Mm(A4_WIDTH_MM), Mm(A4_HEIGHT_MM), Vec::new()));
        }
        self.pages
    }
}

// ===== 排版样式 =====

/// 标题样式：级联缩放
/// H1 最突出（18pt），H4-H6 与正文区别不大但保持粗体
fn heading_style(level: u8) -> TextStyle {
    match level {
        1 => TextStyle { font_size: 18.0, line_height: 25.0, before: 0.0, after: 10.0, bold: true },
        2 => TextStyle { font_size: 14.0, line_height: 21.0, before: 9.0, after: 5.0,  bold: true },
        3 => TextStyle { font_size: 12.5, line_height: 19.0, before: 7.0, after: 3.0,  bold: true },
        _ => TextStyle { font_size: 11.5, line_height: 17.0, before: 5.0, after: 2.0,  bold: true },
    }
}

fn paragraph_style() -> TextStyle {
    TextStyle { font_size: 10.8, line_height: 17.0, before: 1.5, after: 4.0, bold: false }
}

fn code_style() -> TextStyle {
    TextStyle { font_size: 9.8, line_height: 15.5, before: 5.0, after: 5.0, bold: false }
}

fn content_width() -> f32 {
    A4_WIDTH_PT - PAGE_MARGIN_X * 2.0
}

/// 文本颜色：深灰（#1A1E29），比纯黑更柔和
fn text_color() -> Color {
    Color::Rgb(Rgb::new(0.10, 0.12, 0.16, None))
}

// ===== 文本换行引擎 =====

/// 将 spans 列表排成 WrappedLine 列表
///
/// 支持：
///   - 自动换行（按字符宽度累积，超过 max_width 时断开）
///   - 第一行与后续行不同宽度（列表项的第一行有 marker 占用空间）
///   - 硬换行（\n）
///   - 超长单词的逐字符断开（当单个 token 宽度超过行宽时）
///   - 行首空格自动去除
fn wrap_spans(
    spans: &[TextSpan],
    first_width: f32,
    later_width: f32,
    style: TextStyle,
    first_indent: f32,
    later_indent: f32,
) -> Vec<WrappedLine> {
    let mut lines = Vec::new();
    let mut current = WrappedLine { indent: first_indent, spans: Vec::new() };
    let mut current_width = 0.0;
    let mut max_width = first_width;

    for span in spans {
        for token in tokenize_span(span) {
            if token.text == "\n" {
                push_line(&mut lines, &mut current, &mut current_width, &mut max_width, later_width, later_indent);
                continue;
            }

            if token.text == " " && current.spans.is_empty() {
                continue; // 行首空格忽略
            }

            let token_width = estimate_text_width(&token.text, style.font_size);
            if current_width + token_width > max_width && !current.spans.is_empty() {
                push_line(&mut lines, &mut current, &mut current_width, &mut max_width, later_width, later_indent);
                if token.text == " " {
                    continue; // 换行后跳过前导空格
                }
            }

            // 超长 token（如长 URL）：逐字符断开
            if token_width > max_width && current.spans.is_empty() {
                for ch in token.text.chars() {
                    let ch_text = ch.to_string();
                    let ch_width = estimate_text_width(&ch_text, style.font_size);
                    if current_width + ch_width > max_width && !current.spans.is_empty() {
                        push_line(&mut lines, &mut current, &mut current_width, &mut max_width, later_width, later_indent);
                    }
                    append_token(&mut current.spans, TextSpan { text: ch_text, bold: token.bold, code: token.code });
                    current_width += ch_width;
                }
                continue;
            }

            current_width += token_width;
            append_token(&mut current.spans, token);
        }
    }

    if !current.spans.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        lines.push(WrappedLine { indent: first_indent, spans: vec![TextSpan::normal("")] });
    }
    lines
}

fn push_line(
    lines: &mut Vec<WrappedLine>,
    current: &mut WrappedLine,
    current_width: &mut f32,
    max_width: &mut f32,
    later_width: f32,
    later_indent: f32,
) {
    trim_trailing_space(&mut current.spans);
    if !current.spans.is_empty() {
        lines.push(current.clone());
    }
    current.indent = later_indent;
    current.spans.clear();
    *current_width = 0.0;
    *max_width = later_width;
}

fn append_token(spans: &mut Vec<TextSpan>, token: TextSpan) {
    if let Some(last) = spans.last_mut() {
        if last.bold == token.bold && last.code == token.code {
            last.text.push_str(&token.text);
            return;
        }
    }
    spans.push(token);
}

fn trim_trailing_space(spans: &mut Vec<TextSpan>) {
    while let Some(last) = spans.last_mut() {
        let trimmed = last.text.trim_end().to_string();
        if trimmed.is_empty() {
            spans.pop();
        } else {
            last.text = trimmed;
            break;
        }
    }
}

/// 将 TextSpan 切分为绘制 token
///
/// 切分规则：
///   - 换行符 → 独立 token（触发硬换行）
///   - 空白字符 → 统一替换为空格（PDF 中忽略连续空格）
///   - 连续 ASCII 字符 → 一个 token
///   - 每个非 ASCII 字符（CJK/emoji 等） → 独立 token
///
/// 这种切分策略保证 CJK 字符可以在任意位置换行（无需连字符），
/// 而英文单词保持完整（在空格处换行）。
fn tokenize_span(span: &TextSpan) -> Vec<TextSpan> {
    let mut tokens = Vec::new();
    let mut ascii = String::new();

    for ch in span.text.chars() {
        if ch == '\n' {
            flush_ascii_token(&mut tokens, &mut ascii, span);
            tokens.push(TextSpan { text: "\n".to_string(), bold: span.bold, code: span.code });
        } else if ch.is_whitespace() {
            flush_ascii_token(&mut tokens, &mut ascii, span);
            tokens.push(TextSpan { text: " ".to_string(), bold: span.bold, code: span.code });
        } else if ch.is_ascii() {
            ascii.push(ch);
        } else {
            flush_ascii_token(&mut tokens, &mut ascii, span);
            tokens.push(TextSpan { text: ch.to_string(), bold: span.bold, code: span.code });
        }
    }

    flush_ascii_token(&mut tokens, &mut ascii, span);
    tokens
}

fn flush_ascii_token(tokens: &mut Vec<TextSpan>, ascii: &mut String, span: &TextSpan) {
    if ascii.is_empty() {
        return;
    }
    tokens.push(TextSpan { text: std::mem::take(ascii), bold: span.bold, code: span.code });
}

// ===== 字符宽度估算 =====

/// 估算字符串的渲染宽度（pt）
fn estimate_text_width(text: &str, font_size: f32) -> f32 {
    text.chars()
        .map(|ch| estimate_char_width(ch, font_size))
        .sum()
}

/// 估算单个字符的渲染宽度
///
/// 这些系数是经验值，基于等线字体在 10-11pt 时的实际表现。
/// 没有使用 printpdf 的精确度量，因为我们需要在布局阶段
/// （生成 Op 之前）就能判断是否需要换行。
///
/// CJK/全角字符（0.98×fontSize）：几乎是正方形，接近 1em
/// ASCII 字母（0.56×fontSize）：等宽字体的典型比率
/// 数字（0.55×fontSize）：略窄于字母
/// 标点（0.36×fontSize）：半角标点
/// 空格（0.30×fontSize）：标准词间距
fn estimate_char_width(ch: char, font_size: f32) -> f32 {
    if ch.is_whitespace() {
        font_size * 0.30
    } else if ch.is_ascii_digit() {
        font_size * 0.55
    } else if ch.is_ascii_alphabetic() {
        font_size * 0.56
    } else if ch.is_ascii_punctuation() {
        font_size * 0.36
    } else if is_cjk_or_full_width(ch) {
        font_size * 0.98 // CJK 字符近似全角宽度
    } else {
        font_size * 0.72 // 兜底：其他 Unicode 字符
    }
}

/// 判断字符是否为 CJK 或全角字符
///
/// Unicode 范围覆盖：
///   - 韩文音节 (0x1100-0x11FF, 0xAC00-0xD7AF)
///   - CJK 统一表意文字 (0x2E80-0xA4CF, 0xF900-0xFAFF, 0x20000-0x2FA1F)
///   - 全角标点 (0xFE10-0xFE6F, 0xFF00-0xFFEF)
fn is_cjk_or_full_width(ch: char) -> bool {
    matches!(
        ch as u32,
        0x1100..=0x11FF
            | 0x2E80..=0xA4CF
            | 0xAC00..=0xD7AF
            | 0xF900..=0xFAFF
            | 0xFE10..=0xFE6F
            | 0xFF00..=0xFFEF
            | 0x20000..=0x2FA1F
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_export_path_rejects_empty_path() {
        assert!(validate_export_path("").is_err());
    }

    #[test]
    fn markdown_parser_preserves_headings_bold_and_lists() {
        let blocks = markdown_to_pdf_blocks(
            "张三",
            "## 专业技能\n- **Vue** 和 TypeScript\n1. 有序项目\n\n普通段落",
        );

        assert!(matches!(blocks[0], PdfBlock::Heading { level: 1, .. }));
        assert!(blocks.iter().any(|block| matches!(block, PdfBlock::Heading { level: 2, spans } if spans[0].text == "专业技能")));
        assert!(blocks.iter().any(|block| matches!(block, PdfBlock::ListItem { marker, spans, .. } if marker == "•" && spans.iter().any(|span| span.text.contains("Vue") && span.bold))));
        assert!(blocks
            .iter()
            .any(|block| matches!(block, PdfBlock::ListItem { marker, .. } if marker == "1.")));
        assert!(blocks.iter().any(|block| matches!(block, PdfBlock::Paragraph { spans } if spans.iter().any(|span| span.text.contains("普通段落")))));
    }

    #[test]
    fn styled_pdf_builder_creates_valid_pdf_with_embedded_font() {
        let pdf = build_styled_pdf(
            "中文简历",
            "## 项目经验\n- **Vue** TypeScript\n- 有序、无序列表",
        )
        .unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
        assert!(String::from_utf8_lossy(&pdf).contains("%%EOF"));
        assert!(pdf.len() > 10_000);
        assert!(String::from_utf8_lossy(&pdf).contains("/FontDescriptor"));
    }
}
