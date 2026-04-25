import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('persisted editor settings do not store AI secrets or transient AI request state', async () => {
  const [store, aiStore, aiHistorySlice] = await Promise.all([
    readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/store/ai.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/store/aiHistorySlice.ts', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(store, /apiKey/u)
  assert.doesNotMatch(store, /baseUrl/u)
  assert.doesNotMatch(store, /project/u)
  assert.doesNotMatch(store, /draftText/u)
  assert.match(aiStore, /persist\(/u)
  assert.match(aiStore, /partializeAIHistoryState\(state\)/u)
  assert.match(aiStore, /mergePersistedAIHistoryState/u)
  assert.match(aiHistorySlice, /threadIdsByDocument/u)
  assert.match(aiHistorySlice, /sessionHistoryByDocument/u)
  assert.match(aiHistorySlice, /historyRetentionPreset/u)
  assert.doesNotMatch(aiHistorySlice, /draftText/u)
})

test('AIComposer request execution writes draft state only and does not apply document changes before explicit apply', async () => {
  const runtime = await readFile(new URL('../src/components/AI/useAIComposerRuntime.ts', import.meta.url), 'utf8')

  assert.match(runtime, /const response = await runAICompletion\(/)
  assert.match(runtime, /onChunk: \(chunk\) => \{/)
  assert.match(runtime, /appendDraftText\(chunk\)/)
  assert.match(runtime, /setDraftText\(draft\)/)
  assert.doesNotMatch(runtime, /dispatchEditorAIApply\(/u)
})

test('CodeMirrorEditor blocks stale AI apply attempts before dispatching document edits', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /if \(isAIApplySnapshotStale\(detail\.snapshot, currentDoc\)\)/)
  assert.match(editor, /pushErrorNotice\('notices\.aiApplyConflictTitle', 'notices\.aiApplyConflictMessage'\)/)
})
