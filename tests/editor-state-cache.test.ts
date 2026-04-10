import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorState, type StateCommand, type Transaction } from '@codemirror/state'
import { history, redo, undo } from '@codemirror/commands'
import {
  clearEditorStateSnapshot,
  primeAIUndoHistorySnapshot,
  restoreEditorStateSnapshot,
  saveEditorStateSnapshot,
} from '../src/lib/editorStateCache.ts'

function runStateCommand(command: StateCommand, state: EditorState): EditorState {
  let nextState = state
  const didRun = command({
    state,
    dispatch(transaction: Transaction) {
      nextState = transaction.state
    },
  })

  assert.equal(didRun, true)
  return nextState
}

test('AI-seeded snapshots make new-note content undoable', () => {
  const tabId = 'tab-ai-new-note'

  primeAIUndoHistorySnapshot({
    tabId,
    beforeContent: '',
    afterContent: '# Draft\n\nHello AI',
  })

  let state = restoreEditorStateSnapshot({
    tabId,
    content: '# Draft\n\nHello AI',
    extensions: [history()],
  })

  assert.ok(state)

  state = runStateCommand(undo, state)
  assert.equal(state.doc.toString(), '')

  state = runStateCommand(redo, state)
  assert.equal(state.doc.toString(), '# Draft\n\nHello AI')

  clearEditorStateSnapshot(tabId)
})

test('snapshots preserve undo history across editor remounts', () => {
  const tabId = 'tab-remount-history'

  let state = EditorState.create({
    doc: 'hello',
    extensions: [history()],
  })

  state = state.update({
    changes: {
      from: 5,
      to: 5,
      insert: ' world',
    },
  }).state

  saveEditorStateSnapshot(tabId, state)

  const restored = restoreEditorStateSnapshot({
    tabId,
    content: 'hello world',
    extensions: [history()],
  })

  assert.ok(restored)

  const undone = runStateCommand(undo, restored)
  assert.equal(undone.doc.toString(), 'hello')

  clearEditorStateSnapshot(tabId)
})

test('AI-seeded snapshots can stack background updates for the same tab', () => {
  const tabId = 'tab-ai-stack'

  primeAIUndoHistorySnapshot({
    tabId,
    beforeContent: '',
    afterContent: 'First pass',
  })
  primeAIUndoHistorySnapshot({
    tabId,
    beforeContent: 'First pass',
    afterContent: 'Second pass',
  })

  let state = restoreEditorStateSnapshot({
    tabId,
    content: 'Second pass',
    extensions: [history()],
  })

  assert.ok(state)

  state = runStateCommand(undo, state)
  assert.equal(state.doc.toString(), 'First pass')

  state = runStateCommand(undo, state)
  assert.equal(state.doc.toString(), '')

  clearEditorStateSnapshot(tabId)
})
