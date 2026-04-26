# Changelog

This changelog focuses on user-visible changes in `No.1 Markdown Editor`.

## Unreleased

### Added

<!-- New user-visible capability. Prefer Markdown editing, workspace, export, or AI improvements users will actually notice. -->

### Changed

<!-- Behavior, default, workflow, or quality change users will notice in everyday writing. -->

### Fixed

<!-- User-visible fix affecting Markdown fidelity, files, preview, export, performance, or stability. -->

### Internal

<!-- Maintainer-facing refactor, tooling, test, or release-process change worth keeping for project history. -->

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
