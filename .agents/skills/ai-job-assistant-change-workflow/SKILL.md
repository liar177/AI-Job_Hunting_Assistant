---
name: ai-job-assistant-change-workflow
description: Apply the AI Job Assistant repository-specific change workflow together with project-change-testing. Use whenever Codex fixes, implements, refactors, redesigns, or changes source code, Vue UI, Pinia stores, browser localStorage, Tauri IPC or SQLite behavior, RAG behavior, AI generation, file import or export, tests, build and release configuration, or behavior-affecting project documentation. Add project impact analysis, cross-platform compatibility checks, and a fixed verification report without replacing the global test requirements.
---

# AI Job Assistant Change Workflow

Apply this Skill together with `project-change-testing`.

Treat the global Skill as the minimum quality gate. Add the repository-specific
checks below. Do not repeat, weaken, or skip its test planning, test creation,
test execution, browser verification, or result-reporting requirements.

## Before editing

Inspect the affected implementation before making the first project edit. Then
publish the following six-question check in commentary with every item answered:

```md
修改前必答检查

- 本次修改影响哪些页面、Store、存储和桌面端代码？<列出具体文件、模块或“不影响”及依据>
- 必须保持哪些历史行为不变？<列出可观察行为和数据契约>
- 有哪些时间、空值、长文本、刷新、状态往返和旧数据边界？<逐类说明覆盖方式或不适用原因>
- 自动测试准备覆盖什么？<列出拟新增、更新或执行的测试及断言>
- 浏览器将实际点击哪些路径？<按导航、输入、点击和预期可见结果描述；非 UI 修改说明不执行的原因>
- 哪些内容没有验证，为什么？<列出当前已知限制、依赖或环境缺口>
```

Do not edit before publishing the check. Do not replace it with a generic plan
or status update. Name concrete pages, stores, storage branches, Tauri modules,
test cases, and browser routes when they are affected. Use `不适用` or `不影响`
only with a reason. If inspection changes the understood scope, update the
answers before continuing with edits.

## Analyze the affected path

Trace the complete path that the change touches instead of inspecting only the
edited component:

- User interaction -> Vue component -> Pinia store -> `db-adapter` -> browser
  localStorage or Tauri IPC/SQLite.
- AI workflow -> settings/config -> RAG retrieval -> prompt/request -> response
  parsing -> generated result -> persisted resume or application.
- Import/export workflow -> file selection -> parsing/rendering -> saved content
  or exported file.

Read [change-matrix.md](references/change-matrix.md) when the change touches UI,
data, Tauri, RAG, AI, import/export, or release behavior. Apply only the relevant
rows.

## Preserve project invariants

- Keep existing browser localStorage data readable unless the task explicitly
  requires a migration.
- Keep TypeScript and Rust models plus Tauri command payloads aligned when their
  shared contract changes.
- Keep browser and desktop behavior compatible where the platform adapter
  exposes the same operation; document intentional differences.
- Preserve resume version increments and RAG index invalidation when resume
  content changes.
- Keep BM25 fallback usable when embeddings or external AI services are
  unavailable.
- Do not use the user's real credentials, API quota, localStorage, or SQLite
  data during verification.
- Treat release execution, tag creation, pushing, and publishing as separate
  external actions that require explicit user authorization.

## Complete and report

Do not declare the change complete until every planned check has a `PASS`,
`FAIL`, or `NOT RUN` result. Use the following exact top-level structure in the
final response:

```md
### 结果

<说明是否实现目标。>

### 修改内容

- <文件或行为变化>

### 验证

| 测试或检查 | 结果 | 证据 |
|---|---|---|
| <名称或命令> | PASS / FAIL / NOT RUN | <简短结果或原因> |

### 新增或更新的测试

- <测试内容；未新增时说明原因>

### 未验证项和剩余风险

- <未执行项及原因；没有时写“无已知未验证项”。>
```
