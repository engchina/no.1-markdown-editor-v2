# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.18.3`.

It is intentionally written in release-note language rather than implementation language.

## Suggested Release Title

`No.1 Markdown Editor vNext`

## Short Summary

This release tightens the everyday reading and editing rhythm across source, preview, WYSIWYG, and exported HTML.

The headline change is surface fidelity: lists, code, block spacing, outline jumps, and cursor-centered edits now behave more consistently while users move between writing, reviewing, and exporting Markdown.

## Suggested GitHub Release Body

### Highlights

- Preview, WYSIWYG, and standalone HTML now share more prose rhythm tokens for headings, lists, code blocks, math blocks, tables, thematic breaks, and block insets.
- WYSIWYG unordered-list bullets now follow the same disc, circle, and square marker progression as preview.
- Source editing now keeps the viewport steadier for `Delete` and `Enter` edits near a scrolled cursor.
- Outline heading jumps now compensate for app zoom and use immediate scrolling from the outline.
- Visual soft-break preview no longer turns loose Markdown list wrapper whitespace into visible blank gaps.
- Preview and exported inline code now disable font ligatures so literal punctuation stays unchanged.

### Why This Release Matters

Markdown confidence depends on small details staying stable across surfaces. Lists should keep their marker rhythm, code punctuation should remain literal, outline jumps should land where expected, and editing near the bottom of a long document should not pull the writer away from the active line.

This release reduces those mismatches so the editor feels calmer during repeated write, review, and export loops.

### User-Facing Improvements

#### Writing and Editing

- Source mode keeps the viewport stable for ordinary edits around a scrolled cursor, including `Delete` and `Enter`.
- WYSIWYG list bullets now use preview-aligned marker shapes while preserving editable Markdown syntax.
- Shared block insets make code blocks, math blocks, tables, thematic breaks, and blockquotes sit on the same writing grid.

#### Markdown Workspace

- Outline heading navigation now lands more accurately under app zoom and avoids animated overshoot from the outline panel.
- Visual soft-break preview keeps loose Markdown list wrappers from expanding into unwanted blank lines.

#### Performance and Reliability

- Preview and standalone HTML now use shared list, heading, code, and prose rhythm tokens, reducing export drift.
- Inline code in preview and exported HTML disables ligatures so literal Markdown punctuation remains inspectable.
- Additional regression tests protect scroll stability, preview navigation scaling, list soft breaks, code ligatures, and typography parity.

#### AI and Writing Quality

- No AI workflow changes in this release; the focus is Markdown reading, editing, and export fidelity.

### Recommended Screenshots For Release Page

- A nested list shown side by side in WYSIWYG and preview with matching marker progression
- A long source document after `Enter` or `Delete` near the bottom of the viewport
- Exported HTML showing the same list and inline-code punctuation as preview

### Suggested “Upgrade Notes” Section

- This is a Markdown fidelity release focused on rhythm, navigation, and editing stability rather than new workspace features.
- If you rely on outline navigation, long source documents, lists, or exported code-heavy notes, this release should feel steadier.

### Suggested “Who Should Update” Section

This release is especially relevant for users who:

- switch frequently between source, WYSIWYG, preview, and exported HTML
- write long documents where cursor position and viewport stability matter
- review lists, code punctuation, and outline jumps before publishing or sharing

## Packaging Checklist Before Release

- Run `npm run release:prepare -- 0.18.4` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.18.4` if you want to inspect the generated GitHub release body before pushing the tag.
- Replace `vNext` in release copy with the real version tag.
- Capture fresh screenshots if the release page will highlight typography parity or task-list presentation.
- After the release is published, run `npm run release:draft:advance -- 0.18.4` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
