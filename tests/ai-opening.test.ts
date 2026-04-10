import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAIOpenOutputTarget, resolveAISelectedTextRole } from '../src/lib/ai/opening.ts'

test('resolveAIOpenOutputTarget keeps ask/review in chat-only mode', () => {
  assert.equal(resolveAIOpenOutputTarget('ask', undefined, true, 'insert-below'), 'chat-only')
  assert.equal(resolveAIOpenOutputTarget('review', undefined, false, 'at-cursor'), 'chat-only')
})

test('resolveAIOpenOutputTarget respects the default write target for edit/generate flows', () => {
  assert.equal(resolveAIOpenOutputTarget('generate', undefined, false, 'insert-below'), 'insert-below')
  assert.equal(resolveAIOpenOutputTarget('edit', undefined, true, 'replace-selection'), 'replace-selection')
  assert.equal(resolveAIOpenOutputTarget('edit', undefined, false, 'replace-selection'), 'at-cursor')
  assert.equal(resolveAIOpenOutputTarget('generate', 'new-note', false, 'insert-below'), 'new-note')
})

test('resolveAISelectedTextRole falls back to the configured default role', () => {
  assert.equal(resolveAISelectedTextRole(undefined, 'reference-only'), 'reference-only')
  assert.equal(resolveAISelectedTextRole('transform-target', 'reference-only'), 'transform-target')
})
