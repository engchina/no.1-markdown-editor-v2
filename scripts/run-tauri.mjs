import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const DEV_PORT = 1420
const require = createRequire(import.meta.url)
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')

function detectLinuxLibc() {
  if (process.platform !== 'linux') return null

  const report =
    typeof process.report?.getReport === 'function' ? process.report.getReport() : null
  const glibcVersion =
    report?.header?.glibcVersionRuntime ?? report?.header?.glibcVersionCompiler ?? null

  return glibcVersion ? 'gnu' : 'musl'
}

function getExpectedTauriCliPackage() {
  switch (process.platform) {
    case 'darwin':
      if (process.arch === 'arm64') return '@tauri-apps/cli-darwin-arm64'
      if (process.arch === 'x64') return '@tauri-apps/cli-darwin-x64'
      return null
    case 'linux': {
      const libc = detectLinuxLibc()
      if (process.arch === 'arm') return '@tauri-apps/cli-linux-arm-gnueabihf'
      if (process.arch === 'arm64') return `@tauri-apps/cli-linux-arm64-${libc}`
      if (process.arch === 'riscv64') return '@tauri-apps/cli-linux-riscv64-gnu'
      if (process.arch === 'x64') return `@tauri-apps/cli-linux-x64-${libc}`
      return null
    }
    case 'win32':
      if (process.arch === 'arm64') return '@tauri-apps/cli-win32-arm64-msvc'
      if (process.arch === 'ia32') return '@tauri-apps/cli-win32-ia32-msvc'
      if (process.arch === 'x64') return '@tauri-apps/cli-win32-x64-msvc'
      return null
    default:
      return null
  }
}

function listInstalledTauriCliPackages() {
  const tauriPackagesDir = path.join(REPO_ROOT, 'node_modules', '@tauri-apps')
  if (!existsSync(tauriPackagesDir)) return []

  return readdirSync(tauriPackagesDir)
    .filter((name) => name.startsWith('cli-'))
    .map((name) => `@tauri-apps/${name}`)
    .sort()
}

function ensureTauriCliNativeBinding() {
  const expectedPackage = getExpectedTauriCliPackage()
  if (!expectedPackage) return

  try {
    require.resolve(`${expectedPackage}/package.json`)
    return
  } catch {
    const installedPackages = listInstalledTauriCliPackages()
    const runtimeParts = [process.platform, process.arch]
    const linuxLibc = detectLinuxLibc()

    if (linuxLibc) runtimeParts.push(linuxLibc)

    const details = [
      'Tauri CLI native binding for this environment is missing.',
      `Current runtime: ${runtimeParts.join(' ')}`,
      `Expected package: ${expectedPackage}`,
    ]

    if (installedPackages.length > 0) {
      details.push('Installed Tauri CLI packages:')
      for (const pkg of installedPackages) details.push(` - ${pkg}`)
    } else {
      details.push('Installed Tauri CLI packages: none')
    }

    details.push(
      '',
      'This usually means `node_modules` was installed on a different OS and then reused here.',
      'That is common when the same checkout is shared between Windows and WSL/Linux.',
      '',
      'Run `npm install` in this shell to refresh platform-specific optional dependencies.',
      'If the problem persists, remove `node_modules` and reinstall dependencies in this environment.'
    )

    console.error(details.join('\n'))
    process.exit(1)
  }
}

function cleanupStaleDevProcess() {
  if (process.platform !== 'win32') return
  if (args[0] !== 'dev') return

  const executables = ['no1-markdown-editor.exe', 'No.1 Markdown Editor.exe']
  for (const exe of executables) {
    try {
      execFileSync('taskkill', ['/F', '/IM', exe, '/T'], {
        stdio: 'ignore',
      })
    } catch {
      // No stale process for this name is fine.
    }
  }
}

function cleanupDevPort() {
  if (args[0] !== 'dev') return

  if (process.platform === 'win32') {
    try {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `$ids = Get-NetTCPConnection -LocalPort ${DEV_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($id in $ids) { $proc = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($proc -and @('node', 'no1-markdown-editor', 'No.1 Markdown Editor') -contains $proc.ProcessName) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } }`,
        ],
        { stdio: 'ignore' }
      )
    } catch {
      // Ignore cleanup failures and let Tauri surface a real port error if needed.
    }
    return
  }

  try {
    execFileSync(
      'sh',
      [
        '-lc',
        `for pid in $(lsof -ti tcp:${DEV_PORT} -sTCP:LISTEN 2>/dev/null); do cmd=$(ps -o comm= -p "$pid" 2>/dev/null); case "$cmd" in *node*|*no1-markdown-editor*) kill -9 "$pid" ;; esac; done`,
      ],
      { stdio: 'ignore' }
    )
  } catch {
    // Ignore cleanup failures and let Tauri surface a real port error if needed.
  }
}

ensureTauriCliNativeBinding()
cleanupStaleDevProcess()
cleanupDevPort()

const child =
  process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'tauri', ...args], {
        stdio: 'inherit',
      })
    : spawn('tauri', args, {
        stdio: 'inherit',
      })

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
