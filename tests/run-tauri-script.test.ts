import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('Tauri dev wrapper keeps cleanup bounded and starts from the repository root', async () => {
  const source = await readFile(new URL('../scripts/run-tauri.mjs', import.meta.url), 'utf8')

  assert.match(source, /const DEV_CLEANUP_TIMEOUT_MS = 5000/)
  assert.match(source, /timeout: DEV_CLEANUP_TIMEOUT_MS/)
  assert.match(source, /function getTauriCommand\(\)/)
  assert.match(source, /node_modules', '\.bin', binaryName/)
  assert.match(source, /existsSync\(localBinary\) \? localBinary : 'tauri'/)
  assert.match(source, /const tauriCommand = getTauriCommand\(\)/)
  assert.match(source, /cwd: REPO_ROOT/)
  assert.match(source, /child\.on\('error'/)
  assert.match(source, /Failed to start Tauri CLI/)
})
