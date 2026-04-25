# Product Priority Checklist

This document turns the current product-alignment work into an ordered execution checklist.

The goal is to keep `No.1 Markdown Editor` focused on becoming the best Markdown editor, not a generic AI workbench or a Markdown-themed IDE shell.

For code-level implementation planning behind these priorities, see `docs/code-refactor-checklist.md`.

## Order

Work these tracks in order:

1. Product narrative and README alignment
2. AI scope split: stable default surface vs experimental automation
3. Markdown-native workspace surfaces: `Links`, `Inspect`

## 1. Product Narrative and README Alignment

### Objective

Explain the product as a desktop Markdown workbench centered on writing, structure, export fidelity, and safe editor actions.

### Checklist

- [x] Replace the current one-line README headline with a clearer product statement.
- [x] Make core editing strengths the first thing users see:
  - Markdown semantics
  - source / split / preview / focus / WYSIWYG workflow
  - export fidelity
  - cross-platform desktop support
- [x] Move AI below the core editor story instead of presenting it as the product center.
- [x] Add a short `What This Editor Is` section.
- [x] Add a short `What This Editor Is Not` section:
  - not a generic IDE
  - not an always-open AI chat workspace
  - not an autonomous agent shell
- [x] Add one short section that explains why this product exists instead of pointing only to features.
- [x] Promote multilingual support for Japanese, English, and Chinese.
- [x] Add screenshot or short visual references for the main editing modes, not only one generic app screen.

### Acceptance Criteria

- A new user can understand the product direction from the first screenful of the README.
- The README leads with editor quality before AI.
- The product reads as a Markdown-native desktop tool, not an AI demo with an editor attached.

### Primary Files

- `README.md`
- `images/`

## 2. AI Scope Split: Stable vs Experimental

### Objective

Keep AI editor-first by separating default, reliable editing workflows from advanced workspace automation.

### Checklist

- [x] Add a `Stable Default AI Surface` section to the AI spec.
- [x] Add an `Experimental / Advanced AI Surface` section to the AI spec.
- [x] Keep these in the stable default surface:
  - `Ctrl/Cmd+J` composer
  - selection bubble
  - command palette AI actions
  - `Draft / Diff / Apply`
  - explicit context
  - single-step undo
- [x] Move these into the experimental / advanced surface unless proven otherwise:
  - workspace run
  - autonomous multi-note execution
  - phase-aware orchestration
  - broader audit / workflow automation
- [x] State that advanced automation must not displace the writing surface by default.
- [x] State that advanced automation must be easy to disable and must not dominate first-run onboarding.
- [x] Split future smoke / QA planning into `core AI` and `workspace AI` instead of treating them as one product layer.
- [x] Update README language so the public product story matches the AI spec.

### Acceptance Criteria

- The AI spec clearly communicates which features are core and which are experimental.
- Default product positioning remains editor-first.
- Advanced automation no longer reads like the primary reason the product exists.

### Primary Files

- `docs/ai-integration-spec.md`
- `README.md`
- future smoke-test naming and QA docs

## 3. Markdown-Native Workspace Surfaces

### Objective

Upgrade the app from a strong single-document editor to a Markdown project workspace without turning it into a generic IDE shell.

### Checklist

- [x] Add a `Links` workspace surface:
  - outgoing links
  - backlinks
  - unlinked mentions
  - fast navigation to referenced sections
- [x] Add an `Inspect` workspace surface that groups `Assets` and `Health`:
  - `Assets`
  - local images and attachments
  - unresolved paths
  - orphaned assets
  - rename / move repair support
  - `Health`
  - broken links
  - duplicate headings
  - missing image alt text
  - unresolved footnotes
  - invalid or inconsistent front matter
  - export / publish warnings
- [x] Add indexing primitives that can be shared by search, AI context, links, and health checks.
- [x] Add command-palette entries for opening each new workspace surface.
- [x] Keep these surfaces read-mostly and editor-first:
  - inspect
  - jump
  - fix
  - return to writing
- [x] Do not start this track with graph view, plugin marketplace, terminal, or Git tooling.
- [x] Add tests for indexing, navigation, rename propagation, i18n labels, and panel behavior.

### Acceptance Criteria

- A user can manage a Markdown project without leaving the editor for common structural tasks.
- Workspace surfaces help users maintain document quality and project integrity.
- The writing surface remains primary even when project-level panels are added.

### Primary Files

- `src/store/editor.ts`
- `src/components/Sidebar/`
- `src/lib/workspaceSearch.ts`
- future link / asset / health index modules
- tests covering panel behavior and indexing

## Out of Scope For This Alignment Pass

- General plugin marketplace
- Terminal integration
- Git / source control workbench
- Graph view as a headline feature
- Default-on autonomous agent workflows
