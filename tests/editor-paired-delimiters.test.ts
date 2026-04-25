import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { EditorSelection, EditorState } from '@codemirror/state'
import {
  exitEmptyPairedDelimiter,
  resolveClosingDelimiterSkip,
  resolveEmptyPairExit,
  skipClosingPairedDelimiter,
} from '../src/components/Editor/pairedDelimiters.ts'

test('resolveEmptyPairExit moves past empty bracket, parenthesis, and brace pairs', () => {
  assert.equal(resolveEmptyPairExit('[]', 1), 2)
  assert.equal(resolveEmptyPairExit('()', 1), 2)
  assert.equal(resolveEmptyPairExit('{}', 1), 2)
})

test('resolveEmptyPairExit does not move out of non-empty pairs', () => {
  assert.equal(resolveEmptyPairExit('[label]', 6), null)
  assert.equal(resolveEmptyPairExit('(value)', 6), null)
  assert.equal(resolveEmptyPairExit('{key}', 4), null)
})

test('resolveClosingDelimiterSkip skips existing closing delimiters in paired contexts', () => {
  assert.equal(resolveClosingDelimiterSkip('[]', 1, ']'), 2)
  assert.equal(resolveClosingDelimiterSkip('[label]', 6, ']'), 7)
  assert.equal(resolveClosingDelimiterSkip('(value)', 6, ')'), 7)
  assert.equal(resolveClosingDelimiterSkip('{key}', 4, '}'), 5)
  assert.equal(resolveClosingDelimiterSkip('"quote"', 6, '"'), 7)
  assert.equal(resolveClosingDelimiterSkip("'quote'", 6, "'"), 7)
})

test('resolveClosingDelimiterSkip avoids unrelated closing delimiters', () => {
  assert.equal(resolveClosingDelimiterSkip('value]', 5, ']'), null)
  assert.equal(resolveClosingDelimiterSkip('value)', 5, ')'), null)
  assert.equal(resolveClosingDelimiterSkip('value}', 5, '}'), null)
})

test('exitEmptyPairedDelimiter supports Tab-style exit across multiple cursors', () => {
  const state = EditorState.create({
    doc: '[] {}',
    extensions: [EditorState.allowMultipleSelections.of(true)],
    selection: EditorSelection.create([
      EditorSelection.cursor(1),
      EditorSelection.cursor(4),
    ]),
  })
  const { result, nextState } = runCommand(state, exitEmptyPairedDelimiter)

  assert.equal(result, true)
  assert.deepEqual(nextState.selection.ranges.map((range) => range.head), [2, 5])
})

test('skipClosingPairedDelimiter consumes a manually typed closer instead of duplicating it', () => {
  const state = EditorState.create({
    doc: '[label]',
    selection: EditorSelection.cursor(6),
  })
  const { result, nextState } = runCommand(state, (view) => skipClosingPairedDelimiter(view, ']'))

  assert.equal(result, true)
  assert.equal(nextState.doc.toString(), '[label]')
  assert.equal(nextState.selection.main.head, 7)
})

test('autocomplete wiring installs the paired delimiter exit extension next to closeBrackets', async () => {
  const optionalFeatures = await readFile(
    new URL('../src/components/Editor/optionalFeatures.ts', import.meta.url),
    'utf8'
  )

  assert.match(optionalFeatures, /import \{ buildPairedDelimiterExitExtension \} from '\.\/pairedDelimiters\.ts'/)
  assert.match(optionalFeatures, /autocomplete\.closeBrackets\(\),\s*buildPairedDelimiterExitExtension\(\),/u)
})

test('paired delimiters keep matching-bracket rendering visually neutral', async () => {
  const extensions = await readFile(
    new URL('../src/components/Editor/extensions.ts', import.meta.url),
    'utf8'
  )

  assert.match(extensions, /'\.cm-matchingBracket, \.cm-nonmatchingBracket': \{[\s\S]*backgroundColor: 'transparent !important'/u)
  assert.match(extensions, /'\.cm-matchingBracket, \.cm-nonmatchingBracket': \{[\s\S]*outline: 'none !important'/u)
  assert.doesNotMatch(extensions, /'\.cm-matchingBracket, \.cm-nonmatchingBracket': \{[\s\S]*rgba\(59, 130, 246, 0\.15\)/u)
})

function runCommand(
  state: EditorState,
  command: (view: Pick<Parameters<typeof exitEmptyPairedDelimiter>[0], 'state' | 'dispatch'>) => boolean
): { result: boolean; nextState: EditorState } {
  let dispatched: Parameters<EditorState['update']>[0] | null = null
  const view = {
    state,
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      dispatched = spec
    },
  }

  const result = command(view)
  assert.ok(dispatched)

  return {
    result,
    nextState: state.update(dispatched).state,
  }
}
