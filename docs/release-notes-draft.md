# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.20.3`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.20.4`

## Short Summary

No.1 Markdown Editor v0.20.4 makes AI Composer answers easier to reuse by allowing direct text selection inside the result panel.

## Suggested GitHub Release Body

### Highlights

- AI Composer result text can now be selected directly in the answer panel.
- Users can copy a portion of an AI answer with normal system clipboard shortcuts.
- The existing full-result Copy button remains available for copying the whole response.

### Why This Release Matters

AI answers often contain only one sentence, code line, heading, or list item that should be reused. This release makes partial reuse a normal text-selection workflow instead of forcing users to copy the whole answer and trim it elsewhere.

### User-Facing Improvements

#### AI Writing

- AI Composer answers now support direct text selection in the result panel.
- Partial answer text can be copied with standard keyboard shortcuts and platform clipboard behavior.
- Full-answer copying stays available through the existing Copy button.

#### Selection Actions

- The result panel selection behavior is covered by regression tests so answer reuse remains stable across future AI Composer changes.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing documents and AI provider settings are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- review longer AI answers before applying them
- copy only a sentence, code fragment, or list item from an AI response
- prefer native selection and clipboard shortcuts over whole-response copy actions

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.20.4 --date 2026-04-30` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.20.4` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.20.4` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.20.4` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
