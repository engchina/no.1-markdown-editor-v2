import assert from 'node:assert/strict'
import test from 'node:test'
import { countSearchMatches } from '../src/lib/search.ts'

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
