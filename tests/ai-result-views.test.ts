import assert from 'node:assert/strict'
import test from 'node:test'
import { getAIInsertTargets, hasAIDiffPreview, hasAIInsertPreview } from '../src/lib/ai/resultViews.ts'

test('result view helpers distinguish diff previews from insertion previews', () => {
  assert.equal(hasAIDiffPreview('replace-selection', 'before', 'after'), true)
  assert.equal(hasAIDiffPreview('replace-selection', null, 'after'), false)
  assert.equal(hasAIInsertPreview('at-cursor', 'insert this'), true)
  assert.equal(hasAIInsertPreview('insert-below', 'insert this'), true)
  assert.equal(hasAIInsertPreview('new-note', '# New note'), true)
  assert.equal(hasAIInsertPreview('chat-only', 'chat reply'), true)
  assert.equal(hasAIInsertPreview('replace-selection', 'insert this'), false)
})

test('getAIInsertTargets exposes replace only when a selection exists', () => {
  assert.deepEqual(getAIInsertTargets(true), ['replace-selection', 'at-cursor', 'insert-below', 'new-note'])
  assert.deepEqual(getAIInsertTargets(false), ['at-cursor', 'insert-below', 'new-note'])
})
