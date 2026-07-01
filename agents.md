# AI 求职助手 — AI Agent 指南

## 项目概述

AI 求职助手是一个纯前端 SPA，帮助用户管理简历、通过 AI 定制简历、跟踪投递状态。所有数据存储在浏览器 localStorage 中，无后端服务。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 (Composition API, `<script setup>`) |
| 语言 | TypeScript (~5.3) |
| 构建 | Vite 5 |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 (history 模式) |
| UI 库 | Element Plus (全局提醒) + Tailwind CSS 3 (样式) |
| 图标 | lucide-vue-next |
| Markdown | marked + highlight.js |
| 文件解析 | pdfjs-dist (PDF) + mammoth (DOCX) + 自研 DOC 文本提取 |

## 目录结构

```
src/
├── main.ts                  # 入口：挂载 Vue + Pinia + Router + ElementPlus
├── App.vue                  # 根组件，渲染 AppLayout
├── router/index.ts          # 7 条路由
├── types/index.ts           # 所有 TS 接口：Resume, Application, AIConfig 等
├── stores/                  # Pinia stores
│   ├── resume.ts            # 简历 CRUD
│   ├── application.ts       # 投递 CRUD + 筛选 + 统计
│   └── ai.ts                # AI 配置 + 生成简历
├── utils/
│   ├── db.ts               # localStorage 封装（resumeDb, applicationDb, aiConfigDb）
│   ├── ai.ts               # AI API 调用（OpenAI 兼容接口）+ Prompt 模板
│   ├── markdown.ts          # Markdown 渲染、文件导入（PDF/DOCX/DOC）、导出
│   ├── constants.ts         # 状态枚举、状态流转、日期格式化
│   └── message.ts           # Element Plus 消息提示封装
├── views/                   # 页面组件
│   ├── Dashboard.vue        # 首页：统计卡片 + 快捷操作 + 最近投递
│   ├── ResumeList.vue       # 简历列表：新建/导入/删除
│   ├── ResumeDetail.vue     # 简历详情：左右分栏编辑器+预览
│   ├── Customize.vue        # 三步向导：选简历→填岗位→AI 生成
│   ├── ApplicationList.vue  # 投递列表：筛选/搜索/状态管理
│   ├── ApplicationDetail.vue# 投递详情
│   └── Settings.vue         # AI 配置 + 数据导出/清空
└── components/
    ├── Layout/AppLayout.vue # 侧边栏布局 + 导航
    ├── Customize/GenerateResult.vue # AI 生成结果展示
    └── Empty.vue            # 空状态占位
```

## 核心数据模型

```typescript
Resume { id, title, content, originalContent, version, createdAt, updatedAt }
Application { id, companyName, jobTitle, jobDescription, companyInfo, resumeId, status, notes, appliedAt, updatedAt }
AIConfig { id, provider, apiKey, model, baseUrl }
```

Application 状态流转：`applied → hr_read → screen_pass → technical → hr → boss → offer → accepted`（也支持 `rejected`）

## 架构要点

- **数据层**：`utils/db.ts` 中的 `resumeDb`、`applicationDb`、`aiConfigDb` 是对 localStorage 的薄封装，提供 CRUD + 排序。Store 层直接调用它们，不经过 API。
- **AI 生成**：`utils/ai.ts` 调用 OpenAI 兼容的 `/chat/completions` 接口，默认指向 DeepSeek。Prompt 模板 `RESUME_GENERATION_PROMPT` 定义了严格的输出格式。
- **文件导入**：`utils/markdown.ts` 的 `readFile()` 根据扩展名分发：PDF 用 pdfjs-dist 提取文本后推断 Markdown 结构，DOCX 用 mammoth 转换，DOC 用自研二进制文本提取。
- **简历格式**：所有简历内容统一为 Markdown，编辑器和预览分左右栏显示。

## 开发命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 类型检查 + 构建
npm run preview  # 预览构建产物
npm run check    # 仅类型检查
npm run lint     # ESLint 检查
```

## 注意事项

- 这是一个纯前端应用，没有后端，没有数据库迁移问题。
- 所有用户数据在 localStorage 中，清空浏览器数据会丢失，需提示用户备份。
- AI 功能依赖用户配置的 API Key，未配置时相关功能不可用但不会报错。
- 路由使用 `createWebHistory()`，生产部署需配置 SPA fallback。
- 导入的简历文件源类型（PDF/DOCX 等）会记录在 `sourceType` 字段中，但该字段未在 Resume 接口中正式声明（通过类型断言访问）。
