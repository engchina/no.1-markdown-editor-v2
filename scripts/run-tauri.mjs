import { execFileSync, spawn } from 'node:child_process'

const args = process.argv.slice(2)
const DEV_PORT = 1420

function cleanupStaleDevProcess() {
  if (process.platform !== 'win32') return
  if (args[0] !== 'dev') return

  try {
    execFileSync('taskkill', ['/F', '/IM', 'no1-markdown-editor.exe', '/T'], {
      stdio: 'ignore',
    })
  } catch {
    // No stale process is fine.
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
          `$ids = Get-NetTCPConnection -LocalPort ${DEV_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($id in $ids) { $proc = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($proc -and @('node', 'no1-markdown-editor') -contains $proc.ProcessName) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } }`,
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
