# AI 求职助手

## GitHub 自动发布

创建并推送以 `v` 开头的版本标签后，GitHub Actions 会在 Windows runner 上构建 Tauri NSIS 安装包，并以该标签自动创建公开 Release，例如 `v0.2.0`。普通分支推送不会触发发布。

```bash
git tag v0.2.0
git push origin v0.2.0
```

工作流使用仓库内置的 `GITHUB_TOKEN`，无需额外配置发布令牌。创建标签前，应确保标签版本与 `src-tauri/tauri.conf.json` 中的应用版本一致。

> 一个本地优先的智能简历定制与投递管理工具。通过 AI 分析岗位 JD 并生成定向简历，全程数据存储在浏览器本地，安全私密、无需后端。

## 功能概览

| 功能模块 | 说明 |
|----------|------|
| 简历管理 | 创建 / 编辑 / 删除多份简历，支持 PDF、DOCX、DOC、Markdown 文件导入，版本化管理保留原始内容 |
| AI 简历定制 | 两段式智能工作流：先分析岗位匹配度与优化依据，再生成严格排版的定向简历 |
| 投递管理 | 记录每次投递的公司、职位、状态，9 种状态全程追踪，支持筛选与搜索 |
| 数据看板 | 汇总简历数、投递数、面试中、Offer 数，快速掌握求职进度 |
| 本地存储 | 所有数据存储在浏览器 localStorage，不上传任何服务器，支持导出备份 |

## 核心特性

### 两段式 AI 工作流

不同于一步生成的简历工具，本项目采用「先分析、后生成」的双步骤工作流，生成质量更可控：

1. **优化依据分析** — AI 以「资深简历优化顾问」角色，对比原始简历与目标岗位 JD，输出结构化 JSON 报告：
   - 匹配度评分（0-100）与一句话总结
   - 已匹配优势 / 缺少或较弱能力 / 可迁移经历
   - 关键词策略 / 修改策略 / 风险提示

2. **定向简历生成** — AI 以「专业简历优化专家」角色，基于分析报告生成 Markdown 简历：
   - 严格规定输出模板（求职意向 / 个人优势 / 工作经历 / 项目经历 / 教育背景 / 专业技能）
   - 11 条格式规则（禁用方括号、强制分割线、时间格式统一等）
   - 7 条优化规则（优先使用原始量化数据、禁止编造、弱项仅表述为「了解/学习中」）

### 完整的求职状态机

覆盖从投递到接收 Offer 的全周期，含 9 种状态与正向流转顺序：

```
applied → hr_read → screen_pass → technical → hr → boss → offer → accepted
                                                              ↘ rejected
```

### 多格式简历导入

| 格式 | 解析方式 |
|------|----------|
| PDF | pdfjs-dist 按字体 / 坐标结构化提取文本，推断 Markdown 结构 |
| DOCX | mammoth 转换为 HTML 后提取 |
| DOC | 自研二进制文本提取 |
| MD / TXT | 直接读取 |

### 多 AI 服务商兼容

- 内置 **DeepSeek** 预设（开箱即用）
- 支持**自定义**任意 OpenAI 兼容接口（BaseUrl + Model + API Key）

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 语言 | TypeScript ~5.3 |
| 构建 | Vite 5 |
| 状态管理 | Pinia |
| 路由 | Vue Router 4（history 模式） |
| UI 库 | Element Plus（按需自动导入）+ Tailwind CSS 3 |
| 图标 | lucide-vue-next |
| Markdown | marked + highlight.js |
| 文件解析 | pdfjs-dist（PDF）+ mammoth（DOCX）+ 自研 DOC 提取 |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装与运行

```bash
# 克隆项目
git clone <repository-url>
cd 工作简历AI助手

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

打开浏览器访问 `http://localhost:5173`。

### 配置 AI

首次使用前，进入 **设置** 页面配置 AI：

1. 选择 API Provider（DeepSeek 或自定义）
2. 输入 API Key
3. 填写 Base URL 和 Model（选择 DeepSeek 时自动填充）
4. 点击「测试连接」验证配置
5. 保存配置

配置完成后即可使用 AI 简历定制功能。

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览构建产物 |
| `npm run check` | 仅 TypeScript 类型检查 |
| `npm run lint` | ESLint 代码检查 |
| `npm run lint:fix` | ESLint 自动修复 |

## 项目结构

```
src/
├── main.ts                  # 入口：挂载 Vue + Pinia + Router + ElementPlus
├── App.vue                  # 根组件
├── router/index.ts          # 路由配置（7 条路由）
├── types/index.ts           # TypeScript 类型定义
├── stores/                  # Pinia 状态管理
│   ├── resume.ts            # 简历 CRUD
│   ├── application.ts       # 投递 CRUD + 筛选 + 统计
│   └── ai.ts                # AI 配置 + 分析 + 生成
├── utils/
│   ├── db.ts                # localStorage 封装
│   ├── ai.ts                # AI API 调用 + Prompt 模板
│   ├── markdown.ts          # Markdown 渲染 + 文件导入导出
│   ├── constants.ts         # 状态枚举 + 状态流转 + 日期格式化
│   └── message.ts           # Element Plus 消息提示封装
├── views/                   # 页面组件
│   ├── Dashboard.vue        # 首页：统计卡片 + 快捷操作
│   ├── ResumeList.vue       # 简历列表
│   ├── ResumeDetail.vue     # 简历详情：编辑器 + 预览
│   ├── Customize.vue        # AI 简历定制向导
│   ├── ApplicationList.vue  # 投递列表：筛选 / 搜索 / 状态管理
│   ├── ApplicationDetail.vue# 投递详情
│   └── Settings.vue         # AI 配置 + 数据管理
└── components/
    ├── Layout/AppLayout.vue              # 侧边栏布局 + 导航
    ├── Customize/GenerateResult.vue      # AI 生成结果展示
    └── Empty.vue                         # 空状态占位
```

## 数据模型

```typescript
// 简历
Resume {
  id, title, content, originalContent, version, createdAt, updatedAt
}

// 投递记录
Application {
  id, companyName, jobTitle, jobDescription, companyInfo,
  resumeId, status, notes, appliedAt, updatedAt
}

// AI 配置
AIConfig {
  provider: 'deepseek' | 'custom',
  apiKey, model, baseUrl
}
```

## 数据与隐私

- **本地存储**：所有简历、投递记录、AI 配置均存储在浏览器 localStorage 中，不会上传到任何服务器。
- **数据备份**：支持在设置页面一键导出全部数据为 JSON 文件。
- **数据清空**：支持在设置页面清空所有数据（操作前会二次确认）。
- **清空风险**：清除浏览器缓存将导致数据丢失，请定期使用「导出数据」功能备份。

## 部署

```bash
# 构建生产版本
npm run build

# 预览构建产物
npm run preview
```

构建产物位于 `dist/` 目录，可部署到任意静态文件服务器。

> **注意**：路由使用 `createWebHistory()` 模式，生产部署时需配置 SPA fallback（将所有路由回退到 `index.html`）。

## License

MIT
