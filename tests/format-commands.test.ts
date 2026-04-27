import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorState, EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { applyFormat } from '../src/components/Editor/formatCommands.ts'

type DispatchSpec = Parameters<EditorState['update']>[0] & { effects?: unknown }

function createTestView(doc: string, from: number, to = from): EditorView & {
  state: EditorState
  lastDispatch: DispatchSpec | null
} {
  const view = {
    state: EditorState.create({
      doc,
      selection: EditorSelection.create([EditorSelection.range(from, to)]),
    }),
    lastDispatch: null as DispatchSpec | null,
    dispatch(spec: DispatchSpec) {
      view.lastDispatch = spec
      view.state = view.state.update(spec).state
    },
    focus() {},
  }

  return view as unknown as EditorView & { state: EditorState; lastDispatch: DispatchSpec | null }
}

test('applyFormat wraps selected text with underline tags', () => {
  const view = createTestView('hello world', 0, 5)

  applyFormat(view, 'underline')

  assert.equal(view.state.doc.toString(), '<u>hello</u> world')
  assert.equal(view.state.selection.main.from, 3)
  assert.equal(view.state.selection.main.to, 8)
})

test('applyFormat removes underline tags when the full wrapped selection is selected', () => {
  const view = createTestView('<u>hello</u>', 0, 12)

  applyFormat(view, 'underline')

  assert.equal(view.state.doc.toString(), 'hello')
  assert.equal(view.state.selection.main.from, 0)
  assert.equal(view.state.selection.main.to, 5)
})

test('applyFormat wraps selected text with highlight markers', () => {
  const view = createTestView('hello world', 0, 5)

  applyFormat(view, 'highlight')

  assert.equal(view.state.doc.toString(), '==hello== world')
  assert.equal(view.state.selection.main.from, 2)
  assert.equal(view.state.selection.main.to, 7)
})

test('applyFormat removes highlight markers when the full wrapped selection is selected', () => {
  const view = createTestView('==hello==', 0, 9)

  applyFormat(view, 'highlight')

  assert.equal(view.state.doc.toString(), 'hello')
  assert.equal(view.state.selection.main.from, 0)
  assert.equal(view.state.selection.main.to, 5)
})

test('applyFormat cycles the current line through Markdown heading levels', () => {
  const plain = createTestView('Section', 0)
  applyFormat(plain, 'heading')
  assert.equal(plain.state.doc.toString(), '# Section')

  const h1 = createTestView('# Section', 2)
  applyFormat(h1, 'heading')
  assert.equal(h1.state.doc.toString(), '## Section')

  const h6 = createTestView('###### Section', 7)
  applyFormat(h6, 'heading')
  assert.equal(h6.state.doc.toString(), 'Section')
})

test('applyFormat scrolls the updated selection into view after inserting block content', () => {
  const view = createTestView('Paragraph', 9)

  applyFormat(view, 'table')

  assert.ok(Array.isArray(view.lastDispatch?.effects))
  assert.ok((view.lastDispatch?.effects as unknown[] | undefined)?.length)
})
