# AI Integration Spec

## Goal

Build AI as an editor action system inside No.1 Markdown Editor, not as a separate AI workspace.

Core principles:

- Editor-first: AI must not displace the writing surface.
- Explicit context: send only the context the user can see and understand.
- Review before write: any action that changes the document must go through `Draft / Diff / Apply`.
- Single-step undo: one AI apply must be one editor transaction.
- Markdown-safe: output must preserve Markdown structure.
- Desktop-first security: API keys must not live in persisted frontend state.

## Scope

### P0

Ship the first usable AI workflow:

- `Ctrl/Cmd+J` opens AI Composer.
- Selection bubble for common AI actions.
- Command palette AI entries.
- Four action families: `Ask`, `Edit`, `Generate`, `Review`.
- Four output targets: `Chat Only`, `Replace Selection`, `At Cursor`, `Insert Below`.
- `Draft / Diff / Apply` flow.
- Per-document thread binding.
- Streaming in draft area only.
- Provider settings for one OpenAI-compatible backend.

### Not In P0

- Always-open AI sidebar as the primary experience.
- Workspace-wide agent or autonomous multi-step task execution.
- Ghost text as default behavior.
- Automatic whole-document upload.
- Multi-provider UI complexity beyond one OpenAI-compatible adapter.

### P1

Implemented from P1:

- Sidebar `AI` tab.
- Slash commands like `/ai`, `/translate`, `/continue`, `/rewrite`, and `/summarize`.
- Prompt/template library.
- `New Note`.

Still open in P1:

- None.

### P2

- Implemented from P2:
  - Optional ghost text continuation.
  - Authorship/provenance markers for AI-inserted content.
  - Reviewable workspace run draft tasks.
  - Controlled workspace note execution actions.
  - Workspace agent / autonomous multi-file context execution.
  - Phase-aware workspace task grouping and phase-by-phase agent sequencing.

## Current Integration Points

These are the main existing hooks the implementation should reuse:

- `src/App.tsx`
  - lazy command surface mounting
  - app-level modal/palette shell
  - focus mode / split mode layout control
- `src/hooks/useCommands.ts`
  - command registry for command palette
- `src/components/CommandPalette/CommandPalette.tsx`
  - command palette UI and sorting
- `src/components/Editor/CodeMirrorEditor.tsx`
  - replace selection
  - insert at arbitrary range
  - current editor event pattern (`editor:format`, `editor:search`)
- `src/components/Editor/optionalFeatures.ts`
  - slash-triggered completion model
- `src/components/Sidebar/Sidebar.tsx`
  - future sidebar AI tab insertion point
- `src/store/editor.ts`
  - current persisted app/editor state
- `src/lib/lineDiff.ts`
  - existing line diff utility usable for AI preview
- `src-tauri/src/lib.rs`
  - Tauri command pattern
  - existing `reqwest` backend dependency
- `src-tauri/capabilities/default.json`
  - current desktop permission boundary

## Core UX Model

### Entry Points

1. `AI Composer`
   - Trigger: `Ctrl/Cmd+J`
   - Default entry for free-form instructions
   - Appears as a lightweight editor-top overlay

2. `Selection Bubble`
   - Appears only when there is a non-empty selection
   - Shows high-frequency actions:
     - `Ask AI`
     - `Translate`
     - `Rewrite`
     - `Summarize`

3. `Command Palette`
   - Adds discoverable AI commands
   - Best for keyboard-first users

### Action Families

- `Ask`
  - answer without changing the document by default
- `Edit`
  - transform selected text
- `Generate`
  - generate at cursor or below current block
- `Review`
  - critique/explain/suggest without mutating the document by default

### Output Targets

- `chat-only`
- `replace-selection`
- `at-cursor`
- `insert-below`

P0 must not expose output targets that the editor cannot apply safely in one transaction.

## Context Packet

The request payload should be built from a stable snapshot, not from live mutable editor state after the request starts.

```ts
type AIIntent = 'ask' | 'edit' | 'generate' | 'review'
type AIScope = 'selection' | 'current-block' | 'document'
type AIOutputTarget = 'chat-only' | 'replace-selection' | 'at-cursor' | 'insert-below'

interface AIContextPacket {
  tabId: string
  tabPath: string | null
  fileName: string
  documentLanguage: 'zh' | 'en' | 'ja' | 'mixed'
  intent: AIIntent
  scope: AIScope
  outputTarget: AIOutputTarget
  selectedText?: string
  selectedTextRole?: 'transform-target' | 'reference-only'
  beforeText?: string
  afterText?: string
  currentBlock?: string
  headingPath?: string[]
  frontMatter?: string | null
  explicitContextAttachments?: Array<{
    kind: 'note' | 'search'
    label: string
    detail: string
    content: string
  }>
}
```

Default P0 rules:

- If there is a selection, attach `selectedText`.
- Always show attached context as visible chips.
- Do not send the whole document by default.
- Add only a small window of `beforeText` and `afterText`.
- Include `headingPath` when available.
- Include `selectedTextRole` explicitly.

## UI State Model

P0 should use a dedicated AI UI state, separate from normal editor persistence.

```ts
interface AIComposerState {
  open: boolean
  source: 'shortcut' | 'selection-bubble' | 'command-palette'
  intent: AIIntent
  scope: AIScope
  outputTarget: AIOutputTarget
  prompt: string
  context: AIContextPacket | null
  requestState: 'idle' | 'streaming' | 'done' | 'error'
  draftText: string
  explanationText: string
  diffBaseText: string | null
  threadId: string | null
  startedAt: number | null
}
```

Persistence rules:

- Persist thread association by document identity.
- Do not persist API keys in Zustand persisted state.
- Do not persist incomplete streaming buffers across app restarts in P0.

## Event Contract

Follow the existing document event model.

Suggested P0 events:

- `editor:ai-open`
- `editor:ai-run-template`
- `editor:ai-cancel`
- `editor:ai-apply`
- `editor:ai-discard`
- `editor:ai-open-thread`

## Recommended Delivery Order

1. Freeze contracts and P0 scope.
2. Add AI domain types/state/events.
3. Add backend provider adapter and secret storage.
4. Add frontend AI client and request lifecycle.
5. Build AI Composer shell.
6. Integrate selection bubble.
7. Integrate apply/diff/undo.
8. Add command palette and shortcut hooks.
9. Add settings and i18n.
10. Add tests and QA gates.

Do not start polishing sidebar/thread UI before contracts, apply semantics, and undo behavior are stable.

## Implementation Task Tree

### T0. Scope And Contracts

- [x] Freeze P0 action list, output targets, and non-goals.
- [x] Define `AIIntent`, `AIScope`, `AIOutputTarget`, `AIContextPacket`, `AIComposerState`.
- [x] Define request/response transport shapes.
- [x] Define the single source of truth for per-document thread identity.
- [x] Define how document language is detected for P0.
- [x] Define P0 markdown-safe response rules.

### T1. AI State Layer

- [x] Add AI-related state outside the current persisted editor settings block in `src/store/editor.ts`, or create a dedicated AI store.
- [x] Add actions for open/close/set intent/set scope/set output target/set draft/set error/reset request state.
- [x] Add thread association by `tab.path` for saved files and `tab.id` for draft files.
- [x] Ensure no API secrets are stored in persisted editor settings.
- [x] Add stale-snapshot detection fields so apply can detect document drift.

### T2. Backend Provider And Secret Storage

- [x] Add a desktop-only provider adapter in Tauri Rust.
- [x] Start with one OpenAI-compatible backend:
  - base URL
  - model
  - API key
- [x] Add secure secret storage strategy.
- [x] Keep secrets out of renderer persistence.
- [x] Add request timeout and cancellation support.
- [x] Add normalized error mapping for auth, timeout, rate limit, malformed response, and offline cases.
- [x] Define web/dev fallback behavior when desktop secret storage is unavailable.

### T3. Frontend AI Client

- [x] Add a frontend client wrapper to:
  - build `AIContextPacket`
  - submit requests
  - receive streamed draft tokens
  - cancel in-flight requests
- [x] Snapshot editor state before sending.
- [x] Clip context windows deterministically.
- [x] Ensure request completion never directly mutates the document.
- [x] Normalize provider output before it reaches the UI.

### T4. AI Composer UI

- [x] Add an app-level `AIComposer` component mounted from `src/App.tsx`.
- [x] Support `Ctrl/Cmd+J` open behavior.
- [x] Support entry source tracking:
  - shortcut
  - selection bubble
  - command palette
- [x] Add intent switcher.
- [x] Add visible context chips.
- [x] Add free-form prompt input.
- [x] Add output target selector.
- [x] Add result tabs/sections:
  - `Draft`
  - `Diff`
  - `Explain`
- [x] Add action buttons:
  - `Apply`
  - `Insert`
  - `Copy`
  - `Retry`
  - `Discard`
  - `Cancel`

### T5. Selection Bubble

- [x] Detect stable non-empty selection in the editor.
- [x] Anchor the bubble without blocking editing.
- [x] Show only high-frequency actions in P0.
- [x] Ensure keyboard users can reach all selection actions without the bubble.
- [x] Hide bubble on collapsed selection, editor blur, or incompatible modes.

### T6. Document Apply Semantics

- [x] Reuse editor insertion helpers in `src/components/Editor/CodeMirrorEditor.tsx`.
- [x] Guarantee one `view.dispatch` per apply.
- [x] Guarantee one undo step per apply.
- [x] Implement apply modes:
  - replace selection
  - insert at cursor
  - insert below
- [x] Detect stale source snapshot before apply.
- [x] If the document changed after request start, block apply and offer retry.
- [x] Do not apply streaming chunks directly to the document in P0.

### T7. Diff And Preview

- [x] Reuse `src/lib/lineDiff.ts` for preview where possible.
- [x] Show `Diff` only when there is a meaningful base text.
- [x] For insert-only outputs, show a simple insertion preview instead of a fake replace diff.
- [x] For chat-only outputs, suppress apply controls and show insert actions only.
- [x] Make diff readable for Markdown constructs like headings, lists, tables, and fenced code.

### T8. Command Palette And Shortcuts

- [x] Add AI commands to `src/hooks/useCommands.ts`.
- [x] Add command palette presentation in `src/components/CommandPalette/CommandPalette.tsx`.
- [x] Add these commands in P0:
  - `AI: Ask`
  - `AI: Edit Selection`
  - `AI: Continue Writing`
  - `AI: Summarize Selection`
  - `AI: Translate Selection`
- [x] Add the global shortcut `Ctrl/Cmd+J`.
- [x] Ensure no conflict with existing shortcuts.

### T9. Settings

- [x] Add AI settings surface.
- [x] Add provider config fields:
  - base URL
  - model
  - API key
- [x] Add default output target preference.
- [x] Add default selection role preference if needed.
- [x] Add privacy copy explaining what context is sent.
- [x] Add desktop-only fallback messaging if secure storage is unavailable in web mode.

### T10. Prompt And Markdown Safety

- [x] Add prompt layering:
  - system rules
  - policy rules
  - action template
  - user prompt
- [x] Add markdown-safe post-processing.
- [x] Strip useless wrappers like redundant fenced `markdown` blocks when safe.
- [x] Preserve links, tables, code fences, Mermaid, math, headings, and front matter.
- [x] Add language-aware translation prompts for `zh`, `en`, `ja`.

### T11. i18n

- [x] Add AI UI copy to:
  - `src/i18n/locales/en.json`
  - `src/i18n/locales/ja.json`
  - `src/i18n/locales/zh.json`
- [x] Cover:
  - actions
  - output targets
  - request states
  - errors
  - settings
  - privacy copy
  - empty states
- [x] Ensure chips and buttons fit in all three languages.

### T12. Testing

- [x] Unit tests for context packet builder.
- [x] Unit tests for markdown-safe output cleanup.
- [x] Unit tests for selection bubble quick-action presets and positioning helpers.
- [x] Unit tests for stale-snapshot detection.
- [x] Unit tests for diff shaping.
- [x] Integration tests for:
  - opening Composer with shortcut
  - selection bubble visibility
  - apply replace selection
  - apply at cursor
  - insert below
  - one undo per apply
  - request cancellation
  - command palette AI commands
- [x] Desktop-path tests for secret storage and provider error normalization.
- [x] Browser smoke script covers command palette AI execution, selection bubble visibility, inline ghost text continuation, AI provenance markers, settings fallback, request cancellation, apply flows including `New Note`, undo behavior, and source/split/preview/focus/WYSIWYG compatibility checks.
- [x] Browser smoke covers sidebar AI entry and quick actions.
- [x] Browser smoke covers composer and sidebar prompt library starters.
- [x] Browser i18n smoke covers English, Japanese, and Chinese AI labels plus layout overflow checks.
- [x] Keyboard browser smoke covers `Ctrl/Cmd+J` open, streamed draft preview before apply, keyboard run/apply, and editor focus return after apply.
- [x] Manual QA for `zh/en/ja`.

### T13. QA Gates

- [x] Source mode works.
- [x] Split mode works.
- [x] Preview mode does not break.
- [x] Focus mode layout remains clean.
- [x] WYSIWYG mode does not regress.
- [x] Selection-to-AI flow works with code blocks, tables, links, Mermaid, math, and front matter.
- [x] Draft files and saved files both get stable thread identity.
- [x] Web/dev mode degrades gracefully when desktop-only features are unavailable.

### T14. Documentation

- [x] Keep this file updated as tasks progress.
- [x] Add provider setup instructions once implementation begins.
- [x] Add privacy/security notes for API key handling.
- [x] Add a short end-user help section for first use.

## Completion Gates

Do not mark P0 complete until all of these are true:

- [x] Keyboard-only flow works from open to apply.
- [x] AI apply is one undo step.
- [x] No AI request writes to the document before explicit apply.
- [x] No API key is stored in persisted frontend state.
- [x] Selection role is explicit.
- [x] Context chips accurately reflect sent context.
- [x] Streaming stays in draft preview only.
- [x] Stale document detection blocks invalid apply.
- [x] All three locales have complete UI copy.
- [x] Manual QA covers source/split/preview/focus/WYSIWYG.

## Manual QA Log

### 2026-04-09

- Coverage:
  - `en`, `ja`, `zh`
  - `source`, `split`, `preview`, `focus`, `wysiwyg`
- Method:
  - built local preview plus browser-based QA artifact capture
  - AI Composer opened with mock provider enabled so request/result UI could be reviewed consistently
  - review artifacts written to `output/playwright/ai-manual-qa/`
- Verified:
  - Composer opens and remains readable in all tested locales
  - No horizontal overflow was observed in the captured locale/mode set
  - `preview` mode keeps editor mutations disabled and hides apply controls
  - `split` mode keeps both editor and preview visible behind the composer
  - `focus` mode layout remains centered and uncluttered
  - `wysiwyg` mode keeps the AI Composer usable without visible layout regression

## P0 Status

All P0 completion gates were satisfied on 2026-04-09.

The remaining `P2` workspace agent slice was validated on 2026-04-10 with:

- `npm test`
- `npm run build`
- `node scripts/run-ai-smoke.mjs`
- `node scripts/run-ai-keyboard-smoke.mjs`

This does **not** mean the overall AI roadmap is finished. It means the defined `P0` through `P2` integration scope in this document is now implemented; future work can still expand saved-view automation, audit analysis, and broader AI workflows beyond this spec. The current workspace-run layer now supports optional `phase` / `stage` grouping and phase-by-phase execution, but that is still not the end state for the larger AI roadmap.

Within that current scope, dependency-linked `create-note` tasks can now hand their tracked draft tab forward to later `update-note` tasks in the same workflow. This handoff is intentionally conservative: if the draft content has been manually changed since the last workflow-produced version, the follow-up task falls back to the normal dirty-target protection path instead of overwriting it silently.

The workspace execution UI also distinguishes `waiting on dependency` from generic `review`. Tasks whose targets are blocked only because an earlier task has not finished yet now surface as an explicit waiting state in preflight and task status, while review remains reserved for cases that still need user judgment.

The current orchestration layer also detects direct dependency cycles and lets the agent report a stalled phase when none of the remaining tasks in the active phase are runnable. This remains an incremental editor-first workflow system, not a full workflow engine, but it now fails with more precise dependency diagnostics instead of collapsing all such cases into generic waiting or blocked messages.

Phase order is also validated explicitly now: if a task depends on another task that sits in a later phase group, preflight surfaces that as a plan-ordering problem before execution starts. The workspace-run prompt contract now expects phase-based dependencies to point only to the same phase or an earlier one.

When a user manually completes or fixes part of a plan before rerunning the agent, the current orchestration layer now resumes from already completed tasks instead of clearing the whole execution state. That keeps the editor-first recovery loop incremental: unblock the stalled task manually, then continue the remaining run.

Completed-task provenance is now surfaced explicitly inside the current orchestration UI. Task cards and resumed agent logs distinguish between manual applies, draft-open completions, and work completed by the agent, while the compact summary metrics still aggregate into `By Agent / Manual`. That keeps resumed runs explainable without turning the feature into a separate workflow console.

History retrieval and workspace handoff now also consider these workspace execution signals. When AI history contains similar prompt text, runs that actually executed coordinated workspace tasks can rank ahead of weaker passive runs, and duplicate handoff candidates from the same document now prefer the stronger executed record.

## Things Most Likely To Be Missed

- Thread identity for unsaved tabs.
- Web/dev fallback when secure desktop storage is absent.
- Single undo semantics.
- Stale selection after the user keeps editing during a request.
- Markdown-safe handling of fenced code, tables, Mermaid, math, and front matter.
- Focus mode layout behavior.
- i18n for transient states and error messages.
- Not storing secrets in persisted Zustand state.
- Not marking the overall AI epic done after only P0.

## Next Recommended Exploration

The current editor-first AI integration scope is complete. If work continues, the next highest-value area is:

- add broader saved-view automation policies, deeper audit analytics/reporting, and more adaptive workflow planning beyond the current phase-aware dependency model
