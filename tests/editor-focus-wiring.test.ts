import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('editor return-to-writing event is defined and CodeMirror listens for it', async () => {
  const [focusSource, editorSource] = await Promise.all([
    readFile(new URL('../src/lib/editorFocus.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(focusSource, /export const EDITOR_RETURN_TO_WRITING_EVENT = 'editor:return-to-writing'/)
  assert.match(focusSource, /document\.dispatchEvent\(new CustomEvent\(EDITOR_RETURN_TO_WRITING_EVENT\)\)/)

  assert.match(editorSource, /EDITOR_RETURN_TO_WRITING_EVENT/)
  assert.match(editorSource, /document\.addEventListener\(EDITOR_RETURN_TO_WRITING_EVENT, handleReturnToWriting\)/)
  assert.match(editorSource, /view\.focus\(\)/)
})
