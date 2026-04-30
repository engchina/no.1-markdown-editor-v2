# Changelog

This changelog focuses on user-visible changes in `No.1 Markdown Editor`.

## Unreleased

### Added

<!-- New user-visible capability. Prefer Markdown editing, workspace, export, or AI improvements users will actually notice. -->

### Changed

<!-- Behavior, default, workflow, or quality change users will notice in everyday writing. -->

### Fixed

<!-- User-visible fix affecting Markdown fidelity, files, preview, export, performance, or stability. -->

- AI Composer answers can now be selected directly in the result panel, so partial text can be copied with the system clipboard shortcuts in addition to the full-result Copy button.

### Internal

<!-- Maintainer-facing refactor, tooling, test, or release-process change worth keeping for project history. -->

## 0.20.3 - 2026-04-30

### Added

- Added Continue to the `/` AI command flow so inline AI writing actions can continue text from the same entry point as ask, rewrite, translate, summarize, and explain.

### Changed

- `/` AI commands now use the text before `/` as optional context, with a `Use / context` toggle in AI Composer.
- The AI selection bubble now appears only for real text selections, keeping ordinary cursor placement quiet.

### Fixed

- Whitespace-only or `<br />`-only slash prefixes no longer enable `/` context.
- Removed the duplicate prompt-only context hint from AI Composer.

### Internal

- Added regression coverage for slash-command context handling, AI Composer context toggles, and selection-bubble wiring.

## 0.20.2 - 2026-04-29

### Added

### Changed

### Fixed

- Opening a Markdown document from the OS file association no longer reports a phantom batch-open failure when the desktop shell passes extra launch arguments.

### Internal

- Added regression coverage for filtering unsupported launch arguments before forwarding desktop file-open requests.

## 0.20.1 - 2026-04-29

### Added

### Changed

### Fixed

- Update download dialogs now stay inside the editor's visible area in compact, non-fullscreen windows so the header, release notes, and action buttons remain reachable.

### Internal

- Added regression coverage for compact update-dialog layout, body scrolling, and action reachability.

## 0.20.0 - 2026-04-28

### Added

- Added OCI AI setup support for auth profiles, unstructured document stores, structured data stores, hosted agents, and MCP execution profiles.
- AI Data mode can now prepare SQL drafts and surface structured execution actions from configured MCP tools.
- Hosted Agent requests now support OCI OAuth token exchange, resolved endpoint previews, and streamed or JSON answer delivery.

### Changed

- AI Composer now keeps Hosted Agent entry points at the top level while moving SQL draft and MCP execution workflows into Data mode.
- AI result metadata now includes generated SQL, structured execution status, tool names, retrieval query details, and result previews without mixing them into the editable answer text.

### Fixed

- PDF export now encodes output file URIs with spaces before handing them to print backends.
- MCP execution errors now include clearer remote DNS and offline package-install hints.

### Internal

- Added regression coverage for OCI provider normalization, hosted agent URLs, generated SQL handling, MCP execution wiring, Tauri runner behavior, and the expanded AI Composer flows.

## 0.19.5 - 2026-04-28

### Added

### Changed

- AI Composer now keeps the generated answer anchored ahead of retrieval details and exposes source summaries without pushing the answer out of view.

### Fixed

### Internal

- Added regression coverage for the AI Composer retrieval layout and compact source summary behavior.
- Added Qiita implementation notes for line break semantics, Typora compatibility, Preview soft breaks, WYSIWYG hard breaks, and export/clipboard separation.

## 0.19.4 - 2026-04-27

### Added

- Added Copy HTML Source as a separate export action in the toolbar and command palette, so users can copy rendered HTML markup as plain text without using the rich clipboard path.

### Changed

- Copy Preview as HTML is now labeled as Copy Rich HTML across the toolbar, command palette, notices, and English, Japanese, and Chinese locales to make the clipboard behavior explicit.
- WYSIWYG invisible-character markers now appear only on the focused cursor line and clear when the editor loses focus, keeping inactive lines closer to Preview.

### Fixed

- WYSIWYG inline Markdown now normalizes Windows absolute and UNC image paths before sanitization, so local images can enter the same Preview hydration path instead of losing their `src`.

### Internal

- Added Qiita implementation notes for export and clipboard behavior, image handling, Mermaid rendering, syntax highlighting, and WYSIWYG editing.
- Added regression coverage for rich HTML vs HTML source copy, WYSIWYG invisible-character focus behavior, and Windows local-image hydration in inline Markdown.

## 0.19.3 - 2026-04-27

### Added

- Added a Keyboard Shortcuts dialog reachable from the toolbar, command palette, and `Ctrl/Cmd+/`, grouping file, editing, view, AI, export, theme, language, and help shortcuts in one place.
- Added `Ctrl/Cmd+W` close-file handling through the shared dirty-tab save, discard, and cancel flow.
- Preview can now auto-render visible Mermaid diagrams while keeping the manual Render All fallback available for large documents.

### Changed

- Search and replace now use labeled fields, grouped controls, icon navigation, and responsive layout styling.
- Command Palette rows, shortcut badges, and the search field now use a quieter desktop surface with clearer selected-state styling.
- Resize dividers now show pointer-following hints while preserving keyboard resize and reset behavior.
- Toolbar and command palette now expose more Markdown formatting shortcuts, including heading cycling, lists, links, images, and code blocks.
- Invisible character rendering in WYSIWYG now stays limited to the active edit line so inactive lines remain visually closer to Preview.

### Fixed

- Source-editor `Ctrl/Cmd+/` now opens Keyboard Shortcuts instead of triggering CodeMirror Markdown comment commands.
- Primary-modifier shortcut matching is stricter across Windows, macOS, and Linux, reducing accidental shortcut collisions.
- Mermaid automatic and manual rendering now share rendering state so the same diagram is not rendered twice at the same time.

### Internal

- Added Qiita implementation notes and regression coverage for keyboard shortcuts, command palette layout, search UI, close-file shortcuts, platform shortcut matching, Mermaid auto-rendering, layout divider hints, and WYSIWYG invisible character behavior.

## 0.19.2 - 2026-04-27

### Added

- The AI Composer desktop-only fallback now includes a direct Open AI Setup action, so users can move from a blocked AI request to provider configuration without hunting through general settings.

### Changed

- The AI Composer dialog now stays vertically bounded inside the source editor surface and keeps result actions wrapped on compact screens.
- Slash-command AI entry now stays prompt-only unless explicit editor context is attached, preventing text before the `/` trigger from being sent as hidden request context.

### Fixed

- AI Composer keyboard focus now remains inside the modal while it is open, improving keyboard navigation and preventing accidental focus leaks back into the editor.

### Internal

- Added AI smoke, i18n smoke, manual QA capture, and wiring coverage for the setup shortcut, source-bounded composer frame, mobile result actions, modal focus containment, and prompt-only slash-command behavior.

## 0.19.1 - 2026-04-26

### Added

### Changed

### Fixed

- WYSIWYG blockquotes now keep lazy paragraph continuation lines visually quoted, so source editing follows Markdown blockquote structure more closely.
- The update available dialog now keeps release notes scrollable and action buttons reachable in compact window heights.

### Internal

- Added regression coverage for lazy blockquote continuations and compact update dialog layout.

## 0.19.0 - 2026-04-26

### Added

- Windows, macOS, and Linux packages now declare Markdown, MDX, and plain-text document associations so supported files can open directly in No.1 Markdown Editor.

### Fixed

- Windows MSI packages now assign the product icon explicitly to the desktop shortcut and Markdown file associations, preventing blank desktop/file icons after reinstalling.

### Internal

- Added packaging regression coverage for desktop shortcut icons, file association icons, and supported document extensions.

## 0.18.6 - 2026-04-26

### Added

- WYSIWYG mode now renders inactive Mermaid fences as inline diagrams while keeping the original source one click or keypress away.
- WYSIWYG mode now renders block-level HTML `<details>` disclosures as preview-like collapsible blocks, including nested Markdown, tables, and code.

### Changed

- Mermaid diagrams in preview and WYSIWYG now stay centered, scale to the editor width, and scroll horizontally when a diagram is wider than the writing surface.

### Fixed

- Copying a collapsed `<details>` block from preview now preserves the hidden body by expanding the copied range around the full disclosure.
- Pasting a browser-copied collapsed `<details>` block now warns when the browser omitted the hidden body, so users know to expand the source block and copy again.
- HTML paste now recovers Qiita link-card iframe targets as Markdown links instead of dropping the embedded card target.

### Internal

- i18n initialization now works in the Node test runtime without browser storage, with regression coverage for WYSIWYG details, Mermaid rendering, and clipboard fidelity.

## 0.18.5 - 2026-04-26

### Added

### Changed

- The main toolbar now uses a quieter desktop layout with common writing actions kept visible and lower-frequency formatting tools grouped into a single formatting menu.
- Toolbar menus now expose proper menu semantics, arrow-key navigation, and Escape focus restoration so keyboard use is more predictable.
- WYSIWYG table controls now use consistent SVG icons for row, column, delete, and alignment actions instead of text glyphs.

### Fixed

- Command palette and toolbar icons now distinguish command, formatting, outline, and WYSIWYG actions more clearly.
- WYSIWYG table alignment buttons now expose an explicit pressed state only for alignment controls.

### Internal

- Added regression coverage for toolbar menu accessibility, quiet chrome styling, semantic icon usage, localized toolbar labels, and WYSIWYG table toolbar icons.

## 0.18.4 - 2026-04-25

### Added

### Changed

- Preview, WYSIWYG, and standalone HTML now share more of the same prose rhythm for headings, lists, code blocks, math blocks, tables, thematic breaks, and block insets, so switching surfaces keeps Markdown structure visually steadier.
- WYSIWYG unordered-list bullets now use the same disc, circle, and square marker progression as preview while keeping marker sizing aligned with the shared prose line height.

### Fixed

- Source editing now preserves the viewport more reliably for `Delete` and `Enter` edits near an off-screen cursor instead of snapping unexpectedly.
- Preview outline jumps now compensate for app zoom and use an immediate scroll path from the outline, so selected headings land more accurately.
- Visual soft-break preview no longer turns loose Markdown list wrapper whitespace into visible blank gaps.
- Preview and exported inline code now disable font ligatures so literal punctuation such as `***` and `---` stays unchanged.

### Internal

- Added regression coverage for source scroll stability, preview navigation scaling, loose-list soft breaks, inline-code ligatures, and typography token parity across preview, WYSIWYG, and standalone HTML.

## 0.18.3 - 2026-04-25

### Added

### Changed

- WYSIWYG blockquotes now keep the quote rail visible on the active editing line, so nested quote structure stays easier to scan while the `>` markers remain directly editable.
- Preview and standalone HTML now use tighter nested blockquote spacing and shared quote metrics, so quoted writing reads more consistently across editor, preview, and exported output.

### Fixed

- Preview visual soft line breaks no longer force blockquotes into `pre-line`, which prevents quoted paragraphs and nested quote sections from picking up the wrong line-wrapping behavior.

### Internal

- Added regression coverage for active-line blockquote rendering, nested quote spacing, and preview line-break behavior across editing and standalone HTML surfaces.

## 0.18.2 - 2026-04-25

### Added

### Changed

- Preview and WYSIWYG now share the same typography tokens for headings, links, inline code, highlights, blockquotes, footnotes, and thematic breaks, so documents keep a more consistent reading surface across editing modes.
- Task list markers, checkbox sizing, and completed-item styling are now aligned between preview and WYSIWYG for cleaner Markdown list scanning.

### Fixed

- Completed task items no longer force a strikethrough in WYSIWYG. Checked items stay muted, but remain easier to read while reviewing finished work.
- Footnote references and definitions now render with consistent superscript sizing and prose typography instead of mixing mismatched emphasis between editor and preview surfaces.

### Internal

- Added regression coverage for preview and WYSIWYG typography parity across shared tokens, blockquotes, footnotes, task lists, and thematic breaks.
- Removed unused Linux PDF export locals in the native print path.

## 0.18.1 - 2026-04-25

### Added

### Changed

- This tag republishes the Markdown workspace release as `v0.18.1` after fixing the GitHub release automation path that failed on `v0.18.0`.

### Fixed

### Internal

- Fixed GitHub Actions release-body output quoting and multiline delimiter handling so tagged releases publish successfully.

## 0.18.0 - 2026-04-25

### Added

- Markdown-native workspace surfaces for `Links`, `Assets`, and `Health`.
- `Links` now supports outgoing links, backlinks, unlinked mentions, broken-link inspection, and direct broken-link repair suggestions.
- `Assets` now surfaces missing references, orphaned files, and in-note asset repair suggestions.
- `Health` now surfaces duplicate headings, missing image alt text, unresolved footnotes, front matter warnings, and publish warnings.
- Safe current-note bulk fixes from `Health` for common structural issues:
  - missing image alt text
  - broken asset references with clear candidates
  - broken note links with clear candidates
  - duplicate heading renames
  - missing footnote definitions
  - empty front matter title fill
  - missing top-level title insertion
- Shared workspace indexing for document structure, links, assets, and diagnostics.
- Dedicated AI setup panel and clearer AI scope split between stable editor actions and experimental workspace automation.
- Shared document-language detection and spellcheck settings across source and WYSIWYG surfaces.

### Changed

- README positioning now presents the product as a Markdown workbench first, with AI clearly subordinate to editing.
- Workspace search and AI document lookup now use the shared workspace index instead of repeated full rescans.
- Workspace metadata and full document content are now separated, so metadata-only paths stay lightweight.
- Sidebar surfaces now come from a shared registry with command-palette support.
- `Health` and `Links` now follow the same `inspect / jump / fix / return to writing` workflow.

### Internal

- AI store split into dedicated `composer`, `history`, and `provenance` slices.
- Workspace diagnostics rules now live in a dedicated diagnostics module.
- Release-facing product priorities and refactor checklists are now fully checked off in `docs/`.

## 0.17.9 - 2026-04-25

### Added

- Dedicated AI setup panel in the toolbar flow, separating AI connection setup from general editor settings.
- AI i18n smoke coverage for English, Japanese, and Chinese setup labels.

### Changed

- AI settings moved out of the general theme/settings panel into a clearer dedicated setup surface.
