import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasTerminalBlankLine,
  shouldInsertTerminalBlankLineOnArrowDown,
  shouldInsertTerminalBlankLineOnClickBelowDocumentEnd,
} from '../src/lib/editorTerminalBlankLine.ts'

test('hasTerminalBlankLine detects an existing trailing blank line from CodeMirror-like docs', () => {
  const blankDoc = {
    lines: 2,
    line(number: number) {
      return number === 2 ? { text: '' } : { text: 'content' }
    },
  }
  const nonBlankDoc = {
    lines: 1,
    line() {
      return { text: 'content' }
    },
  }

  assert.equal(hasTerminalBlankLine(blankDoc), true)
  assert.equal(hasTerminalBlankLine(nonBlankDoc), false)
})

test('shouldInsertTerminalBlankLineOnArrowDown only triggers for a single caret on the final non-blank line', () => {
  assert.equal(shouldInsertTerminalBlankLineOnArrowDown({
    hasSingleCursor: true,
    selectionEmpty: true,
    selectionLineNumber: 5,
    docLineCount: 5,
    hasTerminalBlankLine: false,
  }), true)

  assert.equal(shouldInsertTerminalBlankLineOnArrowDown({
    hasSingleCursor: true,
    selectionEmpty: true,
    selectionLineNumber: 4,
    docLineCount: 5,
    hasTerminalBlankLine: false,
  }), false)

  assert.equal(shouldInsertTerminalBlankLineOnArrowDown({
    hasSingleCursor: true,
    selectionEmpty: true,
    selectionLineNumber: 5,
    docLineCount: 5,
    hasTerminalBlankLine: true,
  }), false)

  assert.equal(shouldInsertTerminalBlankLineOnArrowDown({
    hasSingleCursor: false,
    selectionEmpty: true,
    selectionLineNumber: 5,
    docLineCount: 5,
    hasTerminalBlankLine: false,
  }), false)

  assert.equal(shouldInsertTerminalBlankLineOnArrowDown({
    hasSingleCursor: true,
    selectionEmpty: false,
    selectionLineNumber: 5,
    docLineCount: 5,
    hasTerminalBlankLine: false,
  }), false)
})

test('shouldInsertTerminalBlankLineOnClickBelowDocumentEnd only triggers below the rendered document end', () => {
  assert.equal(shouldInsertTerminalBlankLineOnClickBelowDocumentEnd({
    clickY: 250,
    documentEndBottom: 200,
    hasTerminalBlankLine: false,
  }), true)

  assert.equal(shouldInsertTerminalBlankLineOnClickBelowDocumentEnd({
    clickY: 200,
    documentEndBottom: 200,
    hasTerminalBlankLine: false,
  }), false)

  assert.equal(shouldInsertTerminalBlankLineOnClickBelowDocumentEnd({
    clickY: 250,
    documentEndBottom: 200,
    hasTerminalBlankLine: true,
  }), false)
})
