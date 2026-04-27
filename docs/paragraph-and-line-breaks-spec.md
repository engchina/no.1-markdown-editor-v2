# Paragraph and Line Breaks Spec

## Goal

Define one stable contract for paragraphs and line breaks across source editing, WYSIWYG/hybrid editing, preview, clipboard, export, and tests.

This spec intentionally separates:

- file semantics
- editing interaction
- preview rendering

That split is required if No.1 Markdown Editor wants both:

- portable Markdown files
- a best-in-class writing experience

## Product Decision

The product uses the following default policy:

- Markdown file semantics default to strict CommonMark/GFM-compatible behavior.
- Editing interaction defaults to Typora-style ergonomics.
- Preview defaults to visual soft-break rendering for writing comfort, while strict rendering remains available as an explicit compatibility mode.

In short:

- `Enter` creates a new paragraph in authoring interaction.
- `Shift+Enter` creates a single line break inside the current paragraph.
- A single newline in Markdown source is a soft break, not a hard break.
- A hard break only comes from explicit hard-break syntax.

## Terminology

### Paragraph

A paragraph is one or more consecutive non-blank lines.

Paragraphs are separated by blank lines.

Multiple blank lines do not create multiple visible empty paragraphs.

### Soft Line Break

A soft line break is a single newline inside one paragraph.

Default strict rendering treats it as paragraph whitespace, not as `<br>`.

### Hard Line Break

A hard line break is a visible line break inside one paragraph.

Accepted hard-break forms:

- two trailing spaces before newline
- backslash before newline
- `<br />`
- `<br>`

## Canonical File Semantics

These rules define the saved Markdown file contract.

1. A single newline inside a paragraph must remain a soft break.
2. A blank line starts a new paragraph.
3. Two or more blank lines still represent one paragraph boundary, not multiple empty paragraphs.
4. Explicit hard-break syntax must round-trip without normalization on save.
5. Export and clipboard logic must preserve the distinction between soft breaks and hard breaks.

## Editing Interaction Contract

These rules define authoring behavior, not file semantics.

### Source Mode

- `Enter` inserts a newline.
- `Shift+Enter` inserts canonical hard-break markup: `"<br />\n"`.
- Inside fenced code blocks and display math blocks, `Shift+Enter` falls back to a plain newline.
- On heading lines, setext heading lines, and thematic-break lines, `Shift+Enter` also falls back to a plain newline instead of injecting hard-break markup.
- The editor must not silently convert a normal `Enter` into a hard break.

### WYSIWYG / Hybrid Mode

- `Enter` means "finish this paragraph/block and continue below".
- `Shift+Enter` means "stay in this paragraph/block and insert a visible line break".
- When a WYSIWYG/hybrid hard break is serialized back to Markdown, it should use the same canonical insertion format as source mode by default: `"<br />"`.
- Inactive fenced code blocks are presentation-only containers, not separate interactive widgets. Editing is selection-driven: when the caret or selection enters the fenced block, raw Markdown source becomes editable again.

### Table Editing

Table cell editing already uses `Shift+Enter` for inline breaks and should continue to do so.

## Preview Contract

### Compatibility Preview Mode: `strict`
Strict preview is the portability and compatibility mode.

Rules:

- soft line breaks render as paragraph whitespace
- blank lines separate paragraphs
- explicit hard breaks render as `<br>`

This mode is the source of truth for export, clipboard HTML generation, and compatibility-sensitive flows.

### Default Writing Preview Mode: `visual-soft-breaks`
This is the default preview mode for writing.

Rules:

- display soft line breaks visually as line breaks
- do not mutate the Markdown source
- do not affect export
- do not affect saved file contents
- this is the current default preview mode

## Canonical Hard-Break Insertion Format

The product default insertion format is:

```md
<br />
```

Reasons:

- stable across renderers
- visually explicit in source mode
- not affected by trailing-whitespace cleanup
- easier to preserve during copy/paste and formatting than trailing spaces

The product must still parse and preserve:

- two-space hard breaks
- backslash hard breaks
- `<br>` and `<br />`

## Invisible Character Visualization Contract

This is a source-editor visual aid, not a Markdown syntax rewrite.

Rules:

- the mode is off by default
- when enabled, source mode shows tabs, trailing whitespace, and special whitespace characters
- when WYSIWYG live preview is enabled, invisible whitespace is limited to the active edit line so inactive lines stay visually consistent with Preview
- line-ending spaces must be more prominent than other invisible characters because they can carry Markdown hard-break intent
- the mode must not change saved Markdown, preview HTML, export HTML, or clipboard HTML
- the mode must not hide backslash hard-break syntax; explicit source remains explicit

## Clipboard and Export Contract

1. Rich preview/export output must preserve hard breaks as HTML line breaks.
2. Plain-text clipboard fallback may flatten paragraph soft breaks as plain text, but it must preserve hard-break intent when converting Markdown to HTML.
3. Copying from preview must not collapse explicit hard breaks back into plain spaces.
4. Export must follow strict preview semantics unless a future option explicitly says otherwise.

## Settings Contract

### Implemented

- `Preview line breaks`
  - `Visual soft breaks` (Default)
  - `Strict`
- `Show invisible characters`
  - Off by default
  - Source-editor visual aid
  - In WYSIWYG live preview, limited to the active edit line

### Not Planned

- A setting that changes saved Markdown semantics
- A setting that rewrites all hard breaks to one syntax on save
- A setting that auto-hides explicit backslash hard-break syntax on non-current lines

## Current Repo Status

### Implemented

- Source editor `Shift+Enter` inserts `"<br />\n"` in `src/components/Editor/extensions.ts`.
- Markdown rendering defaults to strict paragraph behavior in all current render paths:
  - `src/lib/markdown.ts`
  - `src/lib/markdownHtmlRender.ts`
  - `src/lib/markdownMathRender.ts`
  - `src/lib/markdownMathHtmlRender.ts`
  - `src/lib/markdownWorker.ts`
  - `src/lib/markdownWorkerHtmlRender.ts`
- Raw HTML detection now recognizes inline `<br>` markup in `src/lib/markdownHtml.ts`.
- User-visible preview line-break mode is implemented with persisted state, settings UI, and preview-only visual rendering:
  - `strict`
  - `visual-soft-breaks`
- Preview visual soft-break mode is isolated from Markdown parsing, clipboard HTML, and export HTML paths by regression tests.
- Source editor can optionally reveal tabs, trailing whitespace, and special whitespace characters; WYSIWYG live preview limits those markers to the active edit line so inactive lines remain preview-clean. Line-ending spaces are emphasized so Markdown hard breaks are easier to debug.
- WYSIWYG live preview now treats `<br>` / `<br />`, backslash hard breaks, and trailing-space hard breaks as real hard breaks when the cursor is off the line, instead of exposing raw syntax.
- Task-list checkbox keyboard toggles are limited to plain `Enter` / `Space`, so `Shift+Enter` is not consumed by checkbox widgets.
- Markdown structural `Enter` continuation for unordered lists, ordered lists, task lists, and blockquotes is currently provided by the CodeMirror Markdown keymap.
- Interactive WYSIWYG widgets that act like controls, such as task checkboxes and math widgets, are keyboard-focusable and expose visible focus states.
- Footnote reference and definition widgets are keyboard-focusable; activation returns the editor to the relevant source position, and inline references may jump directly to their definition.
- Inactive fenced code blocks remain non-focusable display chrome and signal editability through a text cursor instead of becoming separate tab stops.
- Tests cover strict paragraph semantics, explicit hard breaks, and the source shortcut.

### Not Yet Implemented

- WYSIWYG/hybrid paragraph-vs-line-break contract audit outside current table behavior
- End-to-end behavioral tests for preview-only soft-break visualization across export-adjacent flows

## Implementation Plan

### Phase 0: Strict Baseline

Ship the portable baseline first.

Tasks:

- keep strict rendering as the default renderer behavior
- keep `Shift+Enter` as canonical hard-break insertion in source mode
- preserve explicit hard-break syntax during parsing and rendering
- freeze regression tests for paragraph and line-break behavior

Exit criteria:

- strict paragraph semantics are stable in source, split, preview, worker, clipboard, and export-sensitive code paths

### Phase 1: Preview Toggle

Add a preview-only rendering preference.

Status:

- Implemented for preview UI/state and visual rendering
- Not yet fully audited across every downstream flow

Tasks:

- add persisted state for preview line-break rendering
- surface the setting in UI
- implement preview-only soft-break visualization
- keep export and clipboard HTML on strict semantics unless explicitly changed later

Exit criteria:

- users can choose visual preview behavior without changing saved Markdown semantics

### Phase 2: WYSIWYG / Hybrid Contract Audit

Audit all block editing behaviors against this spec.

Status:

- Partially implemented for inline hard breaks and task checkbox key handling
- Full block-by-block audit still pending

Tasks:

- headings
- blockquotes
- lists
- task lists
- tables
- fenced code blocks
- math blocks
- footnotes
- thematic breaks

Exit criteria:

- `Enter` and `Shift+Enter` are predictable in every editing surface

## Test Checklist

### Renderer Tests

- single newline inside a paragraph stays soft
- blank line creates a new paragraph
- multiple blank lines do not create multiple empty paragraphs
- two trailing spaces create a hard break
- backslash hard break creates a hard break
- `<br />` creates a hard break
- raw HTML render path preserves the same rules
- math render path preserves the same rules
- worker render path preserves the same rules

### Editor Shortcut Tests

- source mode `Shift+Enter` inserts `"<br />\n"`
- caret lands after inserted markup
- multi-selection insertion stays consistent
- invisible-character mode reveals tabs, special whitespace, and trailing hard-break spaces without changing the document text

### Clipboard and Export Tests

- plain-text clipboard HTML preserves paragraph boundaries
- rich clipboard HTML preserves explicit hard breaks
- preview selection to Markdown round-trips hard breaks
- export HTML preserves explicit hard breaks

### WYSIWYG / Hybrid Tests

- paragraph continuation
- paragraph split
- inline line break
- tables
- lists
- blockquotes
- math blocks
- code blocks

## Acceptance Criteria

The feature is correct when:

1. A user can write portable Markdown without learning product-only paragraph semantics.
2. A user can insert an intentional line break with `Shift+Enter`.
3. Preview, clipboard, and export do not disagree about the meaning of soft vs hard breaks.
4. The product can later offer a Typora-like visual preview mode without changing file semantics.
