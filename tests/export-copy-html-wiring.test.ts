import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('useExport keeps Copy as HTML on the rich clipboard path', async () => {
  const source = await readFile(new URL('../src/hooks/useExport.ts', import.meta.url), 'utf8')

  assert.match(source, /const payload = await buildRichClipboardPayload\(activeTab\.content, mermaidTheme\)/)
  assert.match(source, /await writeClipboardPayload\(payload\)/)
  assert.match(source, /await navigator\.clipboard\.writeText\(payload\.html\)/)
  assert.doesNotMatch(source, /buildMarkdownSafeClipboardPayload/)
})
