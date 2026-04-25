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

## 0.17.10 - 2026-04-25

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
