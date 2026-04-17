import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractLegacyAIRetrievalMetadata,
  stripLegacyAIRetrievalQueryPrefix,
} from '../src/lib/ai/retrievalMetadata.ts'

test('stripLegacyAIRetrievalQueryPrefix removes a leading retrieval query object from the answer text', () => {
  const text = ['{"query":"Who is Mei\'s sister?"}', 'Mei\'s older sister is Satsuki.'].join('\n')

  assert.equal(
    stripLegacyAIRetrievalQueryPrefix(text),
    'Mei\'s older sister is Satsuki.'
  )
})

test('stripLegacyAIRetrievalQueryPrefix leaves normal answer text untouched', () => {
  const text = 'Mei\'s older sister is Satsuki.'

  assert.equal(stripLegacyAIRetrievalQueryPrefix(text), text)
})

test('extractLegacyAIRetrievalMetadata returns both the legacy query and cleaned answer text', () => {
  const text = ['{"query":"Who is Mei\'s sister?"}', 'Mei\'s older sister is Satsuki.'].join('\n')

  assert.deepEqual(extractLegacyAIRetrievalMetadata(text), {
    query: 'Who is Mei\'s sister?',
    text: 'Mei\'s older sister is Satsuki.',
  })
})
