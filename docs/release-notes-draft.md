# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.19.0`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.19.1`

## Short Summary

No.1 Markdown Editor v0.19.1 improves source fidelity for WYSIWYG blockquotes and keeps update prompts usable on smaller windows. It is a focused patch for writers who rely on Markdown quote structure and need release notes or update actions to stay reachable in constrained desktop layouts.

## Suggested GitHub Release Body

### Highlights

- WYSIWYG blockquotes now keep lazy paragraph continuation lines visually quoted.
- The update available dialog now keeps release notes scrollable and action buttons reachable in compact window heights.
- Regression coverage now guards lazy blockquote continuations and compact update dialog layout.

### Why This Release Matters

Markdown blockquotes can span paragraph continuation lines without repeating `>` markers. This release makes the WYSIWYG surface follow that Markdown structure more closely, while also keeping update prompts practical on short laptop or split-screen windows.

### User-Facing Improvements

#### Writing and Editing

- Lazy continuation lines inside Markdown blockquotes stay visually connected to the quote in WYSIWYG mode.
- Nested quote continuation depth is preserved when only part of the quote marker sequence appears on the following line.

#### Markdown Workspace

- No workspace-surface changes in this patch release.

#### Performance and Reliability

- Update release notes scroll within the dialog so download, skip, and cancel actions remain reachable on compact screens.

#### AI and Writing Quality

- No AI-surface changes in this patch release.

### Recommended Screenshots For Release Page

- WYSIWYG blockquote with a lazy continuation line beside preview.
- Update available dialog in a short window showing scrollable release notes and visible actions.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- This release keeps existing editing modes and update actions unchanged while improving their behavior.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- maintain multi-note Markdown projects
- care about source fidelity and desktop reliability
- write quoted Markdown prose with lazy continuation lines

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.19.1` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.19.1` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.19.1` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.19.1` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
