# Change Verification Matrix

Use only the rows relevant to the current change. Combine them with the test
depth required by `project-change-testing`.

| Affected area | Inspect and preserve | Minimum project-specific verification |
|---|---|---|
| Vue UI or routing | Navigation, validation, loading/disabled/error/empty states, refresh persistence | Operate the affected flow in a real browser and verify visible state after each important action |
| Pinia or data adapter | Store state, async errors, browser/desktop branch selection | Run targeted tests and verify create/read/update/delete plus refresh when relevant |
| Browser storage | Existing keys, optional fields, defaults, serialized data | Load representative legacy data in an isolated browser profile and verify it remains readable |
| Tauri IPC or SQLite | TypeScript/Rust payload names and types, command registration, schema compatibility | Run frontend type checks and relevant Rust tests or checks; verify the desktop path when available |
| Shared data model | TypeScript interfaces, Rust structs, defaults, import/export shape | Test old and new serialized shapes and both platform implementations where applicable |
| Resume updates or RAG | Version increment, index invalidation, TypeScript/Rust retrieval parity, BM25 fallback | Run focused RAG tests and verify fallback without embedding credentials |
| AI request or parsing | Missing configuration, prompt inputs, malformed/error responses, retry/loading recovery | Use mocks; cover the main success path and an important failure or disabled state |
| Import/export | PDF/DOCX/DOC parsing, Markdown preservation, cancellation and failure handling | Use non-sensitive fixtures and inspect the resulting content or exported file |
| Build or release | Version consistency, build command, release workflow boundaries | Run the changed command plus a smoke build/typecheck; never publish, push, or create tags without explicit authorization |
