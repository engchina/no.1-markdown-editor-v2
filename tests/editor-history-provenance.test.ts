import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorState, type StateCommand, type Transaction } from '@codemirror/state'
import { history, isolateHistory, redo, undo } from '@codemirror/commands'
import {
  createAIProvenanceAddEffect,
  createAIProvenanceExtensions,
  createAIProvenanceMark,
  readAIProvenanceMarksFromState,
} from '../src/lib/ai/provenance.ts'

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

test('AI provenance marks participate in undo and redo history', () => {
  let state = EditorState.create({
    doc: '',
    extensions: [history(), ...createAIProvenanceExtensions()],
  })

  const insertedText = 'hello'
  state = state.update({
    changes: { from: 0, insert: insertedText },
    effects: [
      createAIProvenanceAddEffect(
        createAIProvenanceMark({
          from: 0,
          to: insertedText.length,
          badge: 'AI',
          detail: 'AI apply',
          kind: 'apply',
          createdAt: 1,
        })
      ),
    ],
    annotations: isolateHistory.of('full'),
    userEvent: 'input.ai',
  }).state

  assert.equal(state.doc.toString(), insertedText)
  assert.equal(readAIProvenanceMarksFromState(state).length, 1)

  state = runStateCommand(undo, state)
  assert.equal(state.doc.toString(), '')
  assert.deepEqual(readAIProvenanceMarksFromState(state), [])

  state = runStateCommand(redo, state)
  assert.equal(state.doc.toString(), insertedText)
  assert.equal(readAIProvenanceMarksFromState(state).length, 1)
  assert.equal(readAIProvenanceMarksFromState(state)[0]?.kind, 'apply')
})
