import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  createAITemplateOpenDetail,
  getAITemplateDefinitions,
  getAITemplateModels,
} from '../src/lib/ai/templateLibrary.ts'

const t = (key: string) => key

test('AI template library definitions cover the current reusable prompt starters', () => {
  const definitions = getAITemplateDefinitions()

  assert.deepEqual(
    definitions.map((definition) => definition.id),
    ['ask', 'continueWriting', 'newNote', 'translate', 'rewrite', 'summarize', 'review', 'generateBelow']
  )
})

test('AI template library resolves localized models and open details', () => {
  const models = getAITemplateModels(t)
  const byId = Object.fromEntries(models.map((model) => [model.id, model]))

  assert.equal(byId.ask.prompt, '')
  assert.equal(byId.continueWriting.prompt, 'ai.templates.continueWritingPrompt')
  assert.equal(byId.newNote.prompt, 'ai.templates.newNotePrompt')
  assert.equal(byId.review.prompt, 'ai.templates.reviewPrompt')
  assert.equal(byId.generateBelow.prompt, 'ai.templates.generateBelowPrompt')

  assert.deepEqual(createAITemplateOpenDetail('translate', t, 'command-palette'), {
    source: 'command-palette',
    intent: 'edit',
    outputTarget: 'replace-selection',
    prompt: 'ai.templates.translatePrompt',
  })
  assert.deepEqual(createAITemplateOpenDetail('review', t, 'sidebar-tab'), {
    source: 'sidebar-tab',
    intent: 'review',
    outputTarget: 'chat-only',
    prompt: 'ai.templates.reviewPrompt',
  })
  assert.deepEqual(createAITemplateOpenDetail('newNote', t, 'command-palette'), {
    source: 'command-palette',
    intent: 'generate',
    outputTarget: 'new-note',
    prompt: 'ai.templates.newNotePrompt',
  })
})

test('AI Composer and AI sidebar both expose the prompt library UI surfaces', async () => {
  const [composer, rail] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar/AISidebarPeekRail.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /getAITemplateModels\(t\)/)
  assert.match(composer, /data-ai-template=\{template\.id\}/)
  assert.match(composer, /data-ai-template-filter="focused"/)
  assert.match(composer, /data-ai-template-filter="all"/)
  assert.match(composer, /t\('ai\.templateLibrary\.title'\)/)
  assert.match(rail, /data-ai-sidebar-template=\{template\.id\}/)
  assert.match(rail, /createAITemplateOpenDetail\(template\.id, t, SIDEBAR_TAB_SOURCE\)/)
})
