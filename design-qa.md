# 投递状态设置 Design QA

- Source visual truth: `C:\Users\1\.codex\generated_images\019f5f9b-d442-7c03-850b-af5874414e6d\exec-fa76e01f-cd43-460b-bf02-3858362e88a7.png`
- Implementation screenshot: `D:\study\工作简历AI助手\artifacts\status-manager-implementation.png`
- Full-view comparison evidence: `D:\study\工作简历AI助手\artifacts\status-manager-comparison.png`
- Viewport: 1280 × 720（内置浏览器固定可视区域）
- State: 投递状态设置打开，系统状态默认只展示一条，编辑自定义状态 Dialog 打开，紫色已选，需要面试安排已开启。

**Findings**

- No actionable P0/P1/P2 differences remain.
- 用户在视觉稿后补充“普通 Dialog 必须水平、垂直居中”，实现以该明确要求覆盖原图中略偏移的二级 Dialog。实测管理 Dialog 和编辑 Dialog 中心点均为 `(640, 360)`，与视口中心完全一致。
- 字体与排版：沿用项目现有 Inter / Noto Sans SC 字体栈；标题、标签、说明文字和输入内容的字号、字重与现有应用一致，无截断或异常换行。
- 间距与布局：管理 Dialog 宽 768px，编辑 Dialog 宽 470px；页头、表单、色板、预览及底部操作区层级清晰。内容过高时由内部区域滚动，弹窗仍保持居中。
- 颜色与视觉令牌：沿用现有深蓝主色和浅灰边框；8 个固定状态色均提供浅色标签映射，紫色选中态、勾选图标及标签预览与视觉稿一致。
- 图片与图标：此界面没有业务图片资产；所有操作图标使用项目既有 `lucide-vue-next`，没有占位图或手绘 SVG。
- 文案：系统状态折叠、状态名称、状态描述、面试安排开关、状态颜色和操作文案均与定稿一致。

**Open Questions**

- None.

**Implementation Checklist**

- [x] 状态管理与编辑 Dialog 水平、垂直居中。
- [x] 系统状态默认展示 1 条，其余 8 条折叠。
- [x] 自定义状态名称、描述、面试安排和固定色板。
- [x] 状态标签实时预览。
- [x] 状态在筛选、投递选择器、详情和面试安排中同步生效。
- [x] 使用中的自定义状态禁止删除。

**Comparison History**

- No P0/P1/P2 visual iteration was required. Browser inspection found a development-only Vue attribute warning caused by the Teleport root; `inheritAttrs: false` was added and the rendered UI remained unchanged.

**Follow-up Polish**

- P3: 对照图中的自定义状态数量不同（视觉稿为示例数据 2 条，实现截图为隔离测试数据 1 条），不影响布局或交互验证。

final result: passed
