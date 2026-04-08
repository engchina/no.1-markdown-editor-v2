# no.1-markdown-editor
No.1 Markdown Editor, Free Forever

Project mission and execution principles are defined in `AGENTS.md`.

## Packaging

- Run `npm install` in each OS environment before invoking Tauri. The `@tauri-apps/cli` package uses platform-specific optional dependencies, so reusing `node_modules` between Windows, WSL/Linux, and macOS can break the native binding.
- Run `npm run package:win` on Windows.
- Run `npm run package:mac` on macOS.
