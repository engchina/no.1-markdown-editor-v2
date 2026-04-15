# no.1-markdown-editor
No.1 Markdown Editor, Free Forever

Project mission and execution principles are defined in `AGENTS.md`.

## Screen

![image](./images/screen.png)

## Install

Install latest package from [releases](https://github.com/engchina/no.1-markdown-editor/releases).

- No.1.Markdown.Editor_x.x.x_x64-setup.exe
- No.1.Markdown.Editor_x.x.x_x64_en-US.msi


## Development

- Run `npm install` in each OS environment before invoking Tauri. The `@tauri-apps/cli` package uses platform-specific optional dependencies, so reusing `node_modules` between Windows, WSL/Linux, and macOS can break the native binding.
- Run `npm run dev` to start the desktop app in Tauri dev mode. Frontend edits hot-reload through Vite, and `src-tauri` changes restart the Rust app automatically.
- Run `npm run dev:web` if you only need the browser-based Vite preview.
- Run `npm run package:win` on Windows.
- Run `npm run package:mac` on macOS.
- Run `npm run test:ai:smoke` to exercise command palette AI execution, sidebar AI entry, selection bubble flows, inline ghost text continuation, AI provenance markers, settings fallback, request cancellation, apply paths including `New Note`, undo behavior, and source/split/preview/focus/WYSIWYG mode compatibility against a built local preview.
- Run `npm run test:ai:integration:smoke` to run the main AI integration smoke plus the keyboard-only AI smoke in one pass against a built local preview.
- Run `npm run test:ai:i18n:smoke` to verify the AI-related UI labels and layout in English, Japanese, and Chinese against a built local preview.
- Run `npm run test:ai:keyboard:smoke` to verify the keyboard-only `Ctrl/Cmd+J -> Run -> Apply` path, streamed draft preview isolation before apply, and editor focus return against a built local preview.
- Run `npm run test:ai:manual:qa:capture` to regenerate the locale/mode QA artifact set under `output/playwright/ai-manual-qa/`.
- Run `npm run test:source:smoke` to verify source-editor ordinary typing, plain-text paste, and AI Apply keep the viewport near the active cursor instead of snapping back to the top.

## Release

GitHub release automation is defined in `.github/workflows/release.yml`.

- Keep the version aligned in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
- Create and push a version tag such as `v0.14.0`. The workflow fails early if the tag does not match the app version.
- Pushing the tag builds Windows x64, a single universal macOS release bundle for both Apple Silicon and Intel Macs, and Linux x64 release bundles on GitHub-hosted runners and uploads them to GitHub Releases automatically.

For macOS builds:

- The workflow uses `--target universal-apple-darwin --no-sign`, so one package covers both Apple Silicon and Intel Macs.
- This is intended for local development and direct downloads when Apple signing certificates are not available.
- Unsigned macOS downloads will still show the usual Gatekeeper / Privacy & Security prompts on end-user machines.

Windows installers are still built unsigned by default. If you want SmartScreen-friendly production releases, add a Windows code-signing configuration separately.
