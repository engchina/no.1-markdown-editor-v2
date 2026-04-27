# Upcoming Release Notes Draft

This document is a draft for the next public release after `v0.19.2`.

It is intentionally written in release-note language rather than implementation language.

Start from `CHANGELOG.md` `## Unreleased`, then rewrite the user-visible changes into release-note language here.

## Suggested Release Title

`No.1 Markdown Editor v0.19.3`

## Short Summary

No.1 Markdown Editor v0.19.3 improves keyboard discoverability, search ergonomics, layout resizing, and Mermaid preview rendering. It is a focused desktop-writing update for users who want faster shortcut access, clearer editor controls, and less manual diagram rendering while keeping the writing surface quiet.

## Suggested GitHub Release Body

### Highlights

- A new Keyboard Shortcuts dialog is available from the toolbar, command palette, and `Ctrl/Cmd+/`.
- Search and replace now use labeled, grouped controls with a more compact responsive layout.
- Visible Mermaid diagrams can render automatically in Preview, with manual Render All still available.
- Resize dividers now show pointer-following hints for clearer drag affordance.
- `Ctrl/Cmd+W` now closes the active file through the shared unsaved-changes flow.

### Why This Release Matters

The editor has accumulated powerful keyboard and layout behavior, but those controls need to stay discoverable and predictable. This release brings shortcut help into the app, cleans up common editing controls, and reduces manual Preview work without changing the core Markdown model.

### User-Facing Improvements

#### Writing and Editing

- Keyboard Shortcuts now lists command registry shortcuts plus editor navigation shortcuts in a bounded modal.
- Additional Markdown formatting shortcuts are surfaced in the toolbar and command palette.
- Source-editor `Ctrl/Cmd+/` now opens shortcut help instead of inserting Markdown comment syntax.
- WYSIWYG invisible-character markers now appear only on the active edit line.

#### Markdown Workspace

- `Ctrl/Cmd+W` closes the active file and reuses the existing dirty-tab save, discard, and cancel handling.
- Resize dividers now keep visual hints separate from the layout track while retaining keyboard resize and reset support.

#### Performance and Reliability

- Preview can auto-render visible Mermaid diagrams after the document settles.
- Manual Mermaid rendering remains available, and automatic/manual paths share busy state to avoid duplicate rendering.
- Primary shortcut matching now requires the platform's actual primary modifier, reducing cross-platform collisions.

#### AI and Writing Quality

- Keyboard Shortcuts, Mermaid auto-rendering, search UI, and invisible-character copy are updated across English, Japanese, and Chinese locales.

### Recommended Screenshots For Release Page

- Keyboard Shortcuts dialog showing grouped shortcut columns.
- Search and replace bar with grouped find, replace, and option controls.
- Preview with Mermaid diagrams auto-rendering in view.
- Resize divider hint while dragging between editor and preview.

### Suggested "Upgrade Notes" Section

- No migration steps are required.
- Existing documents, file associations, and AI provider settings are unchanged.

### Suggested "Who Should Update" Section

This release is especially relevant for users who:

- rely on keyboard shortcuts for editing and navigation
- use Find and Replace frequently
- write documents with Mermaid diagrams
- tune sidebar or editor/preview widths often

## Packaging Checklist Before Release

- Fill this draft using the current `CHANGELOG.md` `## Unreleased` section.
- Run `npm run release:prepare -- 0.19.3` to sync the app version files and roll the current `## Unreleased` notes into a dated changelog section.
- Confirm the final version in:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Run `npm run release:validate` after the version bump so local metadata checks, changelog checks, and scaffold-placeholder checks fail before CI does.
- Run `npm run release:notes:preview -- 0.19.3` if you want to inspect the generated GitHub release body before pushing the tag.
- Review the `0.19.3` release notes before tagging.
- Capture fresh screenshots for the product surfaces this release highlights.
- After the release is published, run `npm run release:draft:advance -- 0.19.3` to reset this file and refresh `CHANGELOG.md` `## Unreleased` for the next release cycle.
