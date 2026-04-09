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
