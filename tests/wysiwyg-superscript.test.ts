import assert from 'node:assert/strict'
import test from 'node:test'
import { findInlineSuperscriptRanges } from '../src/components/Editor/wysiwygSuperscript.ts'

test('findInlineSuperscriptRanges matches basic superscript spans', () => {
  assert.deepEqual(findInlineSuperscriptRanges('2^10^'), [
    { from: 1, to: 5, contentFrom: 2, contentTo: 4 },
  ])
})

test('findInlineSuperscriptRanges preserves inline formatting inside superscript content', () => {
  assert.deepEqual(findInlineSuperscriptRanges('x^*2*^ y^**3**^'), [
    { from: 1, to: 6, contentFrom: 2, contentTo: 5 },
    { from: 8, to: 15, contentFrom: 9, contentTo: 14 },
  ])
})

test('findInlineSuperscriptRanges ignores footnote syntax and reserved caret-openers', () => {
  assert.deepEqual(findInlineSuperscriptRanges('[^1] [^note]: value ^[menu]^'), [])
})

test('findInlineSuperscriptRanges ignores escaped, invalid, code, and math carets', () => {
  assert.deepEqual(findInlineSuperscriptRanges('\\^text^ ^ leading^ ^trailing ^ ^text `a^2^` $b^2$'), [])
})
