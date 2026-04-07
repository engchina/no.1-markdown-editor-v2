import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

function collectTests(dir) {
  const entries = readdirSync(dir)
  const files = []

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...collectTests(fullPath))
      continue
    }

    if (entry.endsWith('.test.ts')) {
      files.push(resolve(fullPath))
    }
  }

  return files
}

const testFiles = collectTests(resolve('tests'))

const child = spawn(process.execPath, ['--experimental-strip-types', '--test', ...testFiles], {
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
