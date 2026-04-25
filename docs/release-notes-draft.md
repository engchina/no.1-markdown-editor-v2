# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.17.9`.

It is intentionally written in release-note language rather than implementation language.

## Suggested Release Title

`No.1 Markdown Editor vNext`

## Short Summary

This release turns `No.1 Markdown Editor` into a stronger Markdown project workspace while keeping the writing surface primary.

The headline change is not “more panels.” It is that the editor can now help users inspect, navigate, and repair linked Markdown projects without drifting into IDE-style complexity.

## Suggested GitHub Release Body

### Highlights

- `Links` workspace surface for outgoing links, backlinks, unlinked mentions, and broken-link repair suggestions.
- `Assets` workspace surface for missing references, orphaned files, and direct asset repair suggestions.
- `Health` workspace surface for document structure and publish warnings, with safe current-note fixes for common issues.
- Shared workspace indexing for links, assets, search, diagnostics, and AI document lookup.
- Editor-first AI positioning with a dedicated AI setup panel and clearer stable vs experimental scope.
- Shared multilingual spellcheck and document-language plumbing across source and WYSIWYG editing.

### Why This Release Matters

Markdown projects often break down not because writing is hard, but because structure drifts:

- links go stale
- asset paths break
- headings collide
- footnotes and front matter become inconsistent

This release keeps those maintenance tasks inside the editor instead of forcing users into external scripts, IDE tooling, or manual folder audits.

### User-Facing Improvements

#### Markdown Workspace

- Inspect and jump through document relationships from `Links`.
- See missing or orphaned assets from `Assets`.
- Review structural and publish issues from `Health`.

#### Safe Repair Flows

- Repair common broken note links directly from `Links`.
- Repair common missing asset references from `Assets` and `Health`.
- Apply safe current-note fixes from `Health` for:
  - missing image alt text
  - duplicate headings
  - missing footnote definitions
  - empty front matter title
  - missing top-level title

#### Search and Performance Foundations

- Workspace search now relies on the shared index.
- Metadata-only paths stay lighter because structural metadata and full content loading are now separated.

#### AI and Writing Quality

- AI setup now lives in a dedicated panel instead of being mixed into general editor settings.
- AI remains editor-first: draft, diff, apply, explicit context, and undo stay the stable surface.
- Spellcheck and detected document language now behave more consistently across source and WYSIWYG editing.

### Recommended Screenshots For Release Page

- Split workspace with editor + outline + preview
- `Links` surface with broken-link repair suggestions
- `Assets` surface with missing asset repair suggestions
- `Health` surface with safe current-note fix actions
- Dedicated AI setup panel

### Suggested “Upgrade Notes” Section

- This release adds more workspace-aware side panels, but the writing surface remains primary.
- Advanced AI automation remains subordinate to the default editing flow.
- No plugin marketplace, terminal, graph view, or Git workbench is introduced in this release.

### Suggested “Who Should Update” Section

This release is especially relevant for users who:

- work across multiple Markdown notes
- maintain internal docs or knowledge bases
- need safer link and asset repair workflows
- want AI assistance without turning the editor into a chat-first workspace

## Packaging Checklist Before Release

- Run `npm run release:prepare -- 0.18.0` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata and changelog checks fail before CI does.
- Run `npm run release:notes:preview -- 0.18.0` if you want to inspect the generated GitHub release body before pushing the tag.
- Replace `vNext` in release copy with the real version tag.
- Capture fresh screenshots if the release page will highlight `Links`, `Assets`, `Health`, or the dedicated AI setup panel.
- After the release is published, run `npm run release:draft:advance -- 0.18.0` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
