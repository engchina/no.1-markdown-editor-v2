# Code Refactor Checklist

This document turns the current code-level review into an implementation checklist.

It focuses on the four highest-priority code changes behind the current product direction:

1. shared workspace index foundation
2. AI surface split: stable editor AI vs workspace automation
3. sidebar surface registry for Markdown-native panels
4. spellcheck and document-language plumbing

## Recommended Order

Implement these tracks in this order:

1. shared workspace index foundation
2. AI surface split
3. sidebar surface registry
4. spellcheck and document-language plumbing

The first track is the dependency for `Links`, `Assets`, and `Health`. The second prevents AI complexity from leaking further into the editor shell. The third removes UI hard-coding before new panels land. The fourth improves writing quality without destabilizing the architecture.

## 1. Shared Workspace Index Foundation

### Why

Current workspace search and file-tree refresh logic both walk the workspace directly. That is acceptable for small folders, but it will not scale once the product adds `Links`, `Assets`, and `Health`.

Relevant current files:

- `src/lib/workspaceSearch.ts`
- `src/hooks/useFileTree.ts`
- `src/store/fileTree.ts`
- `src/components/AI/AIComposer.tsx`

### Target Shape

Add one shared workspace index layer that owns:

- document inventory
- headings and title metadata
- extracted links
- local asset references
- health diagnostics

All consumers should query the index instead of scanning the filesystem independently.

### Tasks

- [x] Add a new `src/lib/workspaceIndex/` folder.
- [x] Define shared types in `src/lib/workspaceIndex/types.ts`.
- [x] Create a scanner module that can enumerate supported Markdown documents and capture lightweight metadata.
- [x] Create a content analysis module for:
  - headings
  - outgoing links
  - image and attachment references
  - front matter summary
- [x] Create a diagnostics module for:
  - broken links
  - duplicate headings
  - unresolved assets
  - front matter warnings
- [x] Create a cache / invalidation layer so file-watch events can update only affected paths.
- [x] Refactor `src/lib/workspaceSearch.ts` to query the index instead of reading every file during each search.
- [x] Refactor AI workspace document lookup to reuse the same index-backed metadata path before loading full file content.
- [x] Keep file content loading lazy when only metadata is needed.

### Primary Files

- new: `src/lib/workspaceIndex/types.ts`
- new: `src/lib/workspaceIndex/index.ts`
- new: `src/lib/workspaceIndex/scanner.ts`
- new: `src/lib/workspaceIndex/analysis.ts`
- new: `src/lib/workspaceIndex/diagnostics.ts`
- modify: `src/lib/workspaceSearch.ts`
- modify: `src/hooks/useFileTree.ts`
- modify: `src/store/fileTree.ts` or add a dedicated workspace-index store if needed
- modify: `src/components/AI/AIComposer.tsx`

### Tests

- [x] Update `tests/workspace-search.test.ts`.
- [x] Add index coverage tests for scanning, invalidation, and metadata extraction.
- [x] Add diagnostics tests for links, assets, and front matter warnings.
- [x] Add regression tests proving open-tab search and workspace search still merge correctly.

### Done Means

- Search no longer performs a full workspace content scan per query.
- Future `Links`, `Assets`, and `Health` panels can read one shared source of truth.
- File-watch refreshes can invalidate selectively instead of rebuilding everything blindly.

## 2. AI Surface Split

### Why

`AIComposer.tsx` currently mixes stable editor AI flows with advanced workspace-execution flows. The file is already large enough to slow down safe iteration.

Relevant current files:

- `src/components/AI/AIComposer.tsx`
- `src/store/ai.ts`
- `src/lib/ai/workspaceExecution.ts`

### Target Shape

Keep one AI shell, but split implementation into:

- core editor AI
- workspace automation panel
- workspace automation state / orchestration hook

The default editor AI path must stay readable and locally testable without carrying all workspace-agent concerns.

### Tasks

- [x] Keep `src/components/AI/AIComposer.tsx` as the shell and composition boundary only.
- [x] Extract the stable editor AI surface into a dedicated component, for example:
  - `src/components/AI/AIComposerCoreView.tsx`
- [x] Extract workspace-execution rendering into a dedicated component, for example:
  - `src/components/AI/AIWorkspaceExecutionPanel.tsx`
- [x] Extract workspace-execution orchestration into a hook or controller, for example:
  - `src/components/AI/useAIWorkspaceExecution.ts`
- [x] Move phase grouping, preflight refresh, task execution, and agent resume logic out of the main composer component body.
- [x] Make the shell decide which surface to render instead of embedding both flows inline.
- [x] Reduce direct imports from `workspaceExecution.ts` in the shell.
- [x] Split `src/store/ai.ts` into focused slices so history, composer UI, and advanced workspace state are easier to reason about.

### Primary Files

- modify: `src/components/AI/AIComposer.tsx`
- new: `src/components/AI/AIComposerCoreView.tsx`
- new: `src/components/AI/AIWorkspaceExecutionPanel.tsx`
- new: `src/components/AI/useAIWorkspaceExecution.ts`
- modify: `src/store/ai.ts`
- reuse: `src/lib/ai/workspaceExecution.ts`

### Tests

- [x] Update `tests/ai-command-and-selection-flow.test.ts`.
- [x] Update `tests/ai-flow-wiring.test.ts`.
- [x] Update `tests/ai-workspace-execution.test.ts`.
- [x] Update `tests/ai-sidebar-panel.test.ts` if the panel entry changes.
- [x] Add tests that verify the core composer can render and function without loading workspace-execution UI paths.

### Done Means

- The stable editor AI path is readable without scrolling through workspace-agent code.
- Workspace automation remains available, but is isolated behind a clearer boundary.
- Future AI iteration no longer forces one 4k-line component to absorb every concern.

## 3. Sidebar Surface Registry

### Why

The sidebar is currently fixed to `outline / files / recent / search`. That will make future workspace surfaces more expensive than they should be.

Relevant current files:

- `src/store/editor.ts`
- `src/components/Sidebar/Sidebar.tsx`
- `src/hooks/useCommands.ts`
- `src/components/Icons/AppIcon.tsx`

### Target Shape

Add a single surface registry that defines:

- id
- icon
- title key
- render component
- optional command-palette action

Existing sidebar panels should be converted to registry entries before new panels land.

### Tasks

- [x] Add `src/components/Sidebar/surfaces.ts` to define sidebar surface metadata.
- [x] Replace the hard-coded tab array in `Sidebar.tsx` with registry-driven rendering.
- [x] Replace the `SidebarTab` union maintenance pattern with a registry-backed ID type.
- [x] Split current sidebar sections into dedicated components, for example:
  - `OutlinePanel.tsx`
  - `FileTree.tsx`
  - `RecentPanel.tsx`
  - `SearchPanel.tsx`
- [x] Add registry support for current `Links`, `Assets`, and `Health` panels through the sidebar surface registry.
- [x] Add command-palette actions for opening a specific sidebar surface.
- [x] Centralize icon and i18n wiring for sidebar surfaces.

### Primary Files

- new: `src/components/Sidebar/surfaces.ts`
- new: `src/components/Sidebar/OutlinePanel.tsx`
- new: `src/components/Sidebar/FilesPanel.tsx`
- new: `src/components/Sidebar/RecentPanel.tsx`
- new: `src/components/Sidebar/SearchPanel.tsx`
- modify: `src/components/Sidebar/Sidebar.tsx`
- modify: `src/store/editor.ts`
- modify: `src/hooks/useCommands.ts`
- modify: `src/components/Icons/AppIcon.tsx`
- modify: `src/i18n/locales/en.json`
- modify: `src/i18n/locales/ja.json`
- modify: `src/i18n/locales/zh.json`

### Tests

- [x] Update `tests/ai-sidebar-panel.test.ts`.
- [x] Add a sidebar registry test that ensures declared surfaces are renderable and selectable.
- [x] Add command-palette coverage for opening sidebar surfaces.

### Done Means

- Adding a new workspace panel no longer requires scattering hard-coded edits across store, sidebar, commands, and i18n.
- Existing panels still behave exactly the same from a user perspective.

## 4. Spellcheck and Document-Language Plumbing

### Why

The product already detects document language for AI, but that logic is AI-specific and is not yet reused for writing assistance. WYSIWYG table editing currently disables spellcheck entirely.

Relevant current files:

- `src/lib/ai/context.ts`
- `src/components/Editor/CodeMirrorEditor.tsx`
- `src/components/Editor/wysiwyg.ts`
- `src/store/editor.ts`
- `src/components/ThemePanel/ThemePanel.tsx`

### Target Shape

Promote document-language detection to a general editor primitive and add a user-facing spellcheck mode that can be applied consistently across source and WYSIWYG editing surfaces.

### Tasks

- [x] Extract `detectAIDocumentLanguage` into a general module, for example:
  - `src/lib/documentLanguage.ts`
- [x] Keep AI code using the shared module instead of owning the logic privately.
- [x] Add a persisted editor preference such as:
  - `spellcheckMode: 'system' | 'off' | 'document-language'`
- [x] Apply spellcheck configuration to the main editor DOM in `CodeMirrorEditor.tsx`.
- [x] Apply the same configuration to WYSIWYG table textareas and other embedded text inputs.
- [x] Set `lang` where appropriate when the document language is confidently detected.
- [x] Add a settings control in `ThemePanel.tsx` or the appropriate editor settings surface.
- [x] Add i18n copy for the new setting.

### Primary Files

- new: `src/lib/documentLanguage.ts`
- modify: `src/lib/ai/context.ts`
- modify: `src/store/editor.ts`
- modify: `src/components/Editor/CodeMirrorEditor.tsx`
- modify: `src/components/Editor/wysiwyg.ts`
- modify: `src/components/ThemePanel/ThemePanel.tsx`
- modify: `src/i18n/locales/en.json`
- modify: `src/i18n/locales/ja.json`
- modify: `src/i18n/locales/zh.json`

### Tests

- [x] Update `tests/ai-context.test.ts` to point to the shared language-detection primitive.
- [x] Update `tests/ai-document-language-labels.test.ts` if the import path changes.
- [x] Add editor spellcheck-setting tests.
- [x] Add WYSIWYG table-input tests that verify spellcheck and `lang` are wired consistently.

### Done Means

- Document language is a shared editor primitive, not AI-only logic.
- Spellcheck behavior is consistent across source and WYSIWYG editing surfaces.
- The product is better prepared for multilingual writing-quality features.

## Out of Scope For These Refactors

- plugin marketplace
- terminal integration
- Git workbench
- graph view
- default-on autonomous agent workflows
