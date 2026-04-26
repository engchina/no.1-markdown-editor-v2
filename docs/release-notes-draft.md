# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.18.6`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.19.0`

## Short Summary

Describe this release in 2-3 sentences:

- what changed for users
- why it matters
- what kind of Markdown workflow it improves

## Suggested GitHub Release Body

### Highlights

- Highest-impact user-visible change
- Second most important change
- Third most important change

### Why This Release Matters

Explain the problem this release solves in product language rather than implementation language.

### User-Facing Improvements

#### Writing and Editing

- Key editing improvement
- Source / preview / WYSIWYG improvement

#### Markdown Workspace

- Cross-note / links / assets / project integrity improvement

#### Performance and Reliability

- Speed, fidelity, or stability improvement

#### AI and Writing Quality

- AI scope, setup, or writing-quality improvement

### Recommended Screenshots For Release Page

- Most important UI change
- Best side-by-side workflow shot
- Any repair, inspect, or before/after flow worth showing

### Suggested "Upgrade Notes" Section

- Anything users should notice immediately after updating
- Any changed default or new workflow worth calling out

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- maintain multi-note Markdown projects
- care about source fidelity and desktop reliability
- want editor-first AI rather than chat-first workflow

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.19.0` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.19.0` if you want to inspect the generated GitHub release body before pushing the tag.
- Replace this placeholder release copy with the real `0.19.0` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.19.0` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
