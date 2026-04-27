# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.19.3`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.19.4`

## Short Summary

No.1 Markdown Editor v0.19.4 clarifies export clipboard behavior and tightens WYSIWYG image and invisible-character handling. It separates rich HTML copy from plain-text HTML source copy, keeps WYSIWYG whitespace markers focused on the active writing point, and improves Windows local image preservation in inline Markdown rendering.

## Suggested GitHub Release Body

### Highlights

- Export now includes a dedicated Copy HTML Source action for rendered HTML markup as plain text.
- Copy Preview as HTML is now labeled Copy Rich HTML to clarify that it uses the rich clipboard path.
- WYSIWYG invisible-character markers now appear only on the focused cursor line.
- Windows absolute and UNC image paths in WYSIWYG inline Markdown are normalized before sanitization so local images can hydrate like Preview images.
- New implementation notes document export, clipboard, image handling, Mermaid, syntax highlighting, and WYSIWYG behavior.

### Why This Release Matters

Copying rendered content can mean two different things: placing rich HTML on the clipboard for apps that accept formatted paste, or copying the literal HTML source for publishing and debugging. This release makes that distinction explicit while also smoothing WYSIWYG writing details around whitespace and local image rendering.

### User-Facing Improvements

#### Export and Clipboard

- Copy Rich HTML keeps the existing rich clipboard behavior for formatted paste targets.
- Copy HTML Source copies rendered HTML as plain text.
- Toolbar, command palette, notices, and English, Japanese, and Chinese labels now use explicit wording for both copy paths.

#### WYSIWYG Editing

- Invisible tabs, trailing spaces, and special whitespace markers now stay limited to the focused cursor line.
- Markers clear when the editor loses focus, keeping inactive WYSIWYG lines visually closer to Preview.
- Windows local image paths in inline Markdown are preserved for local image hydration instead of being dropped by sanitization.

#### Documentation

- Added Qiita implementation notes for export and clipboard behavior, image handling, Mermaid rendering, syntax highlighting, and WYSIWYG editing.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing documents, file associations, and AI provider settings are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- copy rendered Markdown into other applications
- need literal HTML source for publishing workflows
- use WYSIWYG mode with invisible-character markers enabled
- work with local images on Windows paths

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.19.4 --date 2026-04-27` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.19.4` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.19.4` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.19.4` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
