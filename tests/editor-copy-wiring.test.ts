import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('CodeMirrorEditor keeps normal copy on the markdown-safe clipboard path', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(source, /const payload = buildMarkdownSafeClipboardPayload\(markdownText\)/)
  assert.match(source, /writeClipboardEventPayload\(event, payload\)/)
  assert.match(source, /if \(fallbackCopied\) return/)
  assert.match(source, /await writeClipboardPayload\(payload\)/)
  assert.doesNotMatch(source, /buildRichClipboardPayload/)
})
