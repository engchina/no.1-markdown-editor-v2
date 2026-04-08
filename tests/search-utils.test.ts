import assert from 'node:assert/strict'
import test from 'node:test'
import { countSearchMatches, findDocumentMatches } from '../src/lib/search.ts'

test('countSearchMatches uses non-overlapping literal matches', () => {
  assert.equal(countSearchMatches('aaaa', 'aa'), 2)
  assert.equal(countSearchMatches('abababa', 'aba'), 2)
})

test('countSearchMatches respects case sensitivity and whole-word search', () => {
  assert.equal(countSearchMatches('Note note notebook', 'note'), 3)
  assert.equal(countSearchMatches('Note note notebook', 'note', { caseSensitive: true }), 2)
  assert.equal(countSearchMatches('Note note notebook', 'note', { wholeWord: true }), 2)
})

test('countSearchMatches handles regex and invalid patterns safely', () => {
  assert.equal(countSearchMatches('a1 a2 a3', 'a\\d', { regexp: true }), 3)
  assert.equal(countSearchMatches('a1 a2 a3', '[', { regexp: true }), 0)
})

test('findDocumentMatches returns line, column, and trimmed text for the first hit on each line', () => {
  assert.deepEqual(
    findDocumentMatches('Alpha beta\nbeta gamma\nnope', 'beta'),
    [
      { line: 1, column: 7, text: 'Alpha beta' },
      { line: 2, column: 1, text: 'beta gamma' },
    ]
  )
})

test('findDocumentMatches respects the max results limit', () => {
  assert.deepEqual(findDocumentMatches('one\ntwo\nthree', 't', 1), [
    { line: 2, column: 1, text: 'two' },
  ])
})
