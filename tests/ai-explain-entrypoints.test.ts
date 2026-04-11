import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createAIQuickActionOpenDetail } from '../src/lib/ai/quickActions.ts'
import {
  AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER,
  getAITemplateDefinitions,
} from '../src/lib/ai/templateLibrary.ts'

const t = (key: string) => key

test('AI keeps explain prompt entry points but removes explain from the reply result view', async () => {
  const [composer, bubble] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AISelectionBubble.tsx', import.meta.url), 'utf8'),
  ])

  assert.ok(getAITemplateDefinitions().some((definition) => definition.id === 'explain'))
  assert.deepEqual(AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER, ['translate', 'summarize', 'explain', 'rewrite'])
  assert.deepEqual(createAIQuickActionOpenDetail('explain', t), {
    source: 'selection-bubble',
    intent: 'ask',
    outputTarget: 'chat-only',
    prompt: 'ai.templates.explainPrompt',
  })

  assert.match(bubble, /const ACTIONS: AIQuickAction\[] = \['ask', 'translate', 'summarize', 'explain', 'rewrite'\]/)
  assert.match(composer, /view: 'draft', label: t\('ai\.result\.draft'\)/)
  assert.match(composer, /view: 'diff', label: t\('ai\.result\.diff'\)/)
  assert.doesNotMatch(composer, /view: 'explain', label: t\('ai\.result\.explain'\)/)
  assert.doesNotMatch(composer, /AIExplainView/)
})
