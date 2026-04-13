import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('MarkdownPreview intercepts document copy events and serializes preview selections as markdown', async () => {
  const source = await readFile(new URL('../src/components/Preview/MarkdownPreview.tsx', import.meta.url), 'utf8')

  assert.match(source, /document\.addEventListener\('copy', onCopy\)/)
  assert.match(source, /extractPreviewSelectionFragment\(selection, preview\)/)
  assert.match(source, /convertPreviewSelectionHtmlToMarkdown\(fragment\.html, fragment\.plainText\)/)
  assert.match(source, /const payload = buildMarkdownSafeClipboardPayload\(markdownText\)/)
  assert.match(source, /writeClipboardEventPayload\(event, payload\)/)
  assert.match(source, /writeClipboardPayload\(payload\)/)
  assert.doesNotMatch(source, /buildRichClipboardPayload/)
})
