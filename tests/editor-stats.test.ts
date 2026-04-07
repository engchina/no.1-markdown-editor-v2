import assert from 'node:assert/strict'
import test from 'node:test'
import { countDocumentStats } from '../src/lib/editorStats.ts'

test('countDocumentStats counts words and chars from markdown content', () => {
  const stats = countDocumentStats('Hello world\n\n- item')

  assert.equal(stats.words, 4)
  assert.equal(stats.chars, 19)
})

test('countDocumentStats treats blank documents as zero words', () => {
  const stats = countDocumentStats('   \n\t')

  assert.equal(stats.words, 0)
  assert.equal(stats.chars, 5)
})
