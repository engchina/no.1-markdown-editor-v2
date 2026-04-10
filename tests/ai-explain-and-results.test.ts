import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAIExplainDetails } from '../src/lib/ai/explain.ts'
import { getAIInsertTargets, hasAIDiffPreview, hasAIInsertPreview } from '../src/lib/ai/resultViews.ts'

test('buildAIExplainDetails lifts the most important request facts into a renderable structure', () => {
  const details = buildAIExplainDetails({
    intent: 'edit',
    outputTarget: 'replace-selection',
    requestState: 'done',
    source: 'selection-bubble',
    provider: 'openai-compatible',
    model: 'gpt-4.1-mini',
    threadId: 'thread-1',
    context: {
      tabId: 'tab-1',
      tabPath: 'notes/demo.md',
      fileName: 'demo.md',
      documentLanguage: 'en',
      intent: 'edit',
      scope: 'selection',
      outputTarget: 'replace-selection',
      selectedText: 'hello',
      selectedTextRole: 'transform-target',
      headingPath: ['Intro', 'Details'],
      explicitContextAttachments: [
        {
          id: 'note:demo',
          kind: 'note',
          label: 'project-plan.md',
          detail: 'notes/project-plan.md',
          content: '# Plan',
        },
      ],
    },
  })

  assert.equal(details.intent, 'edit')
  assert.equal(details.outputTarget, 'replace-selection')
  assert.equal(details.requestState, 'done')
  assert.equal(details.source, 'selection-bubble')
  assert.equal(details.fileName, 'demo.md')
  assert.equal(details.documentLanguage, 'en')
  assert.equal(details.selectedTextRole, 'transform-target')
  assert.equal(details.headingPath, 'Intro > Details')
  assert.equal(details.explicitContext, '@note project-plan.md')
  assert.equal(details.provider, 'openai-compatible')
  assert.equal(details.model, 'gpt-4.1-mini')
  assert.equal(details.threadId, 'thread-1')
})

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
