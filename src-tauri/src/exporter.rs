use std::{fmt::Write as _, fs, path::Path};

const A4_WIDTH: f32 = 595.0;
const A4_HEIGHT: f32 = 842.0;
const PAGE_MARGIN_X: f32 = 50.0;
const PAGE_START_Y: f32 = 790.0;
const MAX_LINE_UNITS: usize = 72;
const MAX_LINES_PER_PAGE: usize = 47;

pub fn save_text_file(path: &str, content: &str) -> Result<String, String> {
    let path = validate_export_path(path)?;
    fs::write(&path, content.as_bytes()).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

pub fn save_pdf_file(path: &str, title: &str, content: &str) -> Result<String, String> {
    let path = validate_export_path(path)?;
    let pdf = build_simple_pdf(title, content);
    fs::write(&path, pdf).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn validate_export_path(path: &str) -> Result<std::path::PathBuf, String> {
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

fn build_simple_pdf(title: &str, content: &str) -> Vec<u8> {
    let pages = paginate_lines(markdown_to_pdf_lines(title, content));
    let page_count = pages.len().max(1);
    let object_count = 4 + page_count * 2;
    let mut objects = vec![String::new(); object_count + 1];

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>".to_string();
    objects[3] = "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>".to_string();
    objects[4] = "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> /DW 1000 >>".to_string();

    let mut kids = Vec::new();
    for page_index in 0..page_count {
        let page_id = 5 + page_index * 2;
        let content_id = page_id + 1;
        kids.push(format!("{page_id} 0 R"));
        let lines = pages.get(page_index).cloned().unwrap_or_default();
        let stream = pdf_content_stream(&lines);
        objects[page_id] = format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {A4_WIDTH:.0} {A4_HEIGHT:.0}] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>"
        );
        objects[content_id] = format!(
            "<< /Length {} >>\nstream\n{}endstream",
            stream.len(),
            stream
        );
    }

    objects[2] = format!(
        "<< /Type /Pages /Kids [{}] /Count {page_count} >>",
        kids.join(" ")
    );

    write_pdf_objects(&objects)
}

fn write_pdf_objects(objects: &[String]) -> Vec<u8> {
    let mut pdf = Vec::new();
    pdf.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    let mut offsets = vec![0usize; objects.len()];

    for object_id in 1..objects.len() {
        offsets[object_id] = pdf.len();
        pdf.extend_from_slice(
            format!("{object_id} 0 obj\n{}\nendobj\n", objects[object_id]).as_bytes(),
        );
    }

    let xref_offset = pdf.len();
    pdf.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", objects.len()).as_bytes());
    for offset in offsets.iter().skip(1) {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
            objects.len()
        )
        .as_bytes(),
    );
    pdf
}

fn pdf_content_stream(lines: &[String]) -> String {
    let mut stream = String::from("BT\n/F1 11 Tf\n15 TL\n");
    let _ = writeln!(stream, "1 0 0 1 {PAGE_MARGIN_X:.0} {PAGE_START_Y:.0} Tm");
    for line in lines {
        if line.trim().is_empty() {
            stream.push_str("T*\n");
            continue;
        }
        let _ = writeln!(stream, "<{}> Tj", utf16be_hex(line));
        stream.push_str("T*\n");
    }
    stream.push_str("ET\n");
    stream
}

fn markdown_to_pdf_lines(title: &str, content: &str) -> Vec<String> {
    let mut result = Vec::new();
    let clean_title = title.trim();
    if !clean_title.is_empty() {
        result.extend(wrap_pdf_line(clean_title));
        result.push(String::new());
    }

    let mut in_code_block = false;
    for raw_line in content.replace("\r\n", "\n").lines() {
        let mut line = raw_line.trim().to_string();
        if line.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if !in_code_block {
            line = clean_markdown_line(&line);
        }
        if line.is_empty() {
            result.push(String::new());
        } else {
            result.extend(wrap_pdf_line(&line));
        }
    }

    if result.is_empty() {
        result.push(String::new());
    }
    result
}

fn clean_markdown_line(line: &str) -> String {
    let mut text = line.trim().to_string();
    while text.starts_with('#') {
        text.remove(0);
    }
    text = text.trim().to_string();
    if let Some(stripped) = text.strip_prefix("- ") {
        text = format!("• {stripped}");
    } else if let Some(stripped) = text.strip_prefix("* ") {
        text = format!("• {stripped}");
    } else if let Some(stripped) = text.strip_prefix("> ") {
        text = stripped.to_string();
    }
    text.replace("**", "").replace("__", "").replace('`', "")
}

fn wrap_pdf_line(line: &str) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    let mut width = 0usize;

    for ch in line.chars() {
        let char_width = if ch.is_ascii() { 1 } else { 2 };
        if !current.is_empty() && width + char_width > MAX_LINE_UNITS {
            lines.push(current.trim_end().to_string());
            current.clear();
            width = 0;
        }
        current.push(ch);
        width += char_width;
    }

    if !current.trim().is_empty() {
        lines.push(current.trim_end().to_string());
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

fn paginate_lines(lines: Vec<String>) -> Vec<Vec<String>> {
    let mut pages = Vec::new();
    let mut current = Vec::new();

    for line in lines {
        if current.len() >= MAX_LINES_PER_PAGE {
            pages.push(current);
            current = Vec::new();
        }
        current.push(line);
    }

    if !current.is_empty() {
        pages.push(current);
    }
    pages
}

fn utf16be_hex(value: &str) -> String {
    let mut hex = String::new();
    for unit in value.encode_utf16() {
        let _ = write!(hex, "{unit:04X}");
    }
    hex
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_export_path_rejects_empty_path() {
        assert!(validate_export_path("").is_err());
    }

    #[test]
    fn pdf_builder_creates_valid_pdf_envelope() {
        let pdf = build_simple_pdf("中文简历", "## 项目经验\n- Vue TypeScript");
        assert!(pdf.starts_with(b"%PDF-1.4"));
        assert!(pdf.ends_with(b"%%EOF\n"));
        assert!(String::from_utf8_lossy(&pdf).contains("/Type /Catalog"));
        assert!(String::from_utf8_lossy(&pdf).contains("/UniGB-UCS2-H"));
    }

    #[test]
    fn markdown_lines_are_wrapped_and_cleaned_for_pdf() {
        let lines = markdown_to_pdf_lines("标题", "## 技能\n- Vue 和 TypeScript\n**加粗**");
        assert!(lines.contains(&"标题".to_string()));
        assert!(lines.contains(&"技能".to_string()));
        assert!(lines.contains(&"• Vue 和 TypeScript".to_string()));
        assert!(lines.contains(&"加粗".to_string()));
    }
}
