import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('CodeMirrorEditor applies AI insertions with the resolved trailing-line cursor anchor', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /const \{ range, text, selectionAnchor \} = resolveAIApplyChange\(/)
  assert.match(editor, /selectionAnchor,/)
})
