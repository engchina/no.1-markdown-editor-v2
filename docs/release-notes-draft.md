# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.19.4`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.19.5`

## Short Summary

No.1 Markdown Editor v0.19.5 improves the AI Composer result layout so generated answers stay first while retrieval sources remain easy to inspect. It also adds detailed implementation notes for strict Markdown line break semantics, Typora compatibility, visual soft-break preview, WYSIWYG hard breaks, and export/clipboard separation.

## Suggested GitHub Release Body

### Highlights

- AI Composer now keeps the generated answer anchored ahead of retrieval details.
- Retrieval source summaries are available from the answer header without pushing the answer out of view.
- Expanded retrieval details now sit below the result panel with compact previews and localized source labels.
- New implementation notes document line break semantics, Typora compatibility, visual soft-break preview, WYSIWYG hard breaks, and export/clipboard behavior.

### Why This Release Matters

AI answers should remain the primary writing surface even when retrieval metadata is available. This release keeps sources inspectable without letting reference details displace the draft, and documents the line-break compatibility rules that keep writing preview comfort separate from portable Markdown output.

### User-Facing Improvements

#### AI Composer

- Result panels now stay answer-first when retrieval details are available.
- Source summaries are shown as compact header actions with English, Japanese, and Chinese labels.
- Retrieval details can be expanded below the answer and include compact previews before the full detail view.

#### Documentation

- Added Qiita implementation notes for line break semantics and Typora compatibility.
- Documented how strict Markdown semantics, Preview visual soft breaks, WYSIWYG hard breaks, tables, clipboard, and export stay separated.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing documents, file associations, and AI provider settings are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- use AI Composer with retrieval-backed answers
- review or cite source material before applying AI output
- want Typora-like line break preview without changing saved Markdown semantics
- need export and clipboard output to stay portable Markdown-compatible

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.19.5 --date 2026-04-28` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.19.5` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.19.5` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.19.5` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
