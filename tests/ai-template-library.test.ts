import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER,
  createAITemplateOpenDetail,
  getAITemplateDefinitions,
  getAITemplateModels,
  resolveAIComposerTemplateResolution,
} from '../src/lib/ai/templateLibrary.ts'

const t = (key: string) => key

test('AI template library definitions cover the current reusable prompt starters', () => {
  const definitions = getAITemplateDefinitions()

  assert.deepEqual(
    definitions.map((definition) => definition.id),
    ['ask', 'continueWriting', 'translate', 'summarize', 'explain', 'rewrite']
  )
})

test('AI Composer suggestions keep continue writing first while preserving the transform starter order', () => {
  assert.deepEqual(AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER, [
    'continueWriting',
    'translate',
    'summarize',
    'explain',
    'rewrite',
  ])
})

test('AI template library resolves localized models and open details', () => {
  const models = getAITemplateModels(t)
  const byId = Object.fromEntries(models.map((model) => [model.id, model]))

  assert.equal(byId.ask.prompt, '')
  assert.equal(byId.continueWriting.prompt, 'ai.templates.continueWritingPrompt')
  assert.equal(byId.translate.prompt, 'ai.templates.translatePrompt')
  assert.equal(byId.summarize.prompt, 'ai.templates.summarizePrompt')
  assert.equal(byId.explain.prompt, 'ai.templates.explainPrompt')
  assert.equal(byId.rewrite.prompt, 'ai.templates.rewritePrompt')

  assert.deepEqual(createAITemplateOpenDetail('translate', t, 'command-palette'), {
    source: 'command-palette',
    intent: 'edit',
    outputTarget: 'replace-selection',
    prompt: 'ai.templates.translatePrompt',
  })
  assert.deepEqual(createAITemplateOpenDetail('explain', t, 'command-palette'), {
    source: 'command-palette',
    intent: 'ask',
    outputTarget: 'chat-only',
    prompt: 'ai.templates.explainPrompt',
  })
  assert.deepEqual(createAITemplateOpenDetail('rewrite', t, 'command-palette'), {
    source: 'command-palette',
    intent: 'edit',
    outputTarget: 'replace-selection',
    prompt: 'ai.templates.rewritePrompt',
  })
})

test('AI locale prompt templates keep task intent while removing repeated Markdown-structure guidance', async () => {
  const [en, ja, zh] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8').then(JSON.parse),
  ])

  assert.equal(
    en.ai.templates.translatePrompt,
    'Translate the input content.'
  )
  assert.equal(
    en.ai.templates.summarizePrompt,
    'Summarize the input content while preserving the key meaning.'
  )
  assert.equal(
    en.ai.templates.explainPrompt,
    'Explain the input content in plain language. Break down any complex terms, structures, or concepts so they are easy to understand.'
  )
  assert.equal(
    en.ai.templates.rewritePrompt,
    'Rewrite the input content to improve clarity and flow while preserving meaning.'
  )

  assert.equal(ja.ai.templates.translatePrompt, '入力内容を翻訳してください。')
  assert.equal(ja.ai.templates.summarizePrompt, '入力内容を要約し、重要な意味を保ってください。')
  assert.equal(
    ja.ai.templates.explainPrompt,
    '入力内容をわかりやすい言葉で説明してください。複雑な用語・構造・概念があれば噛み砕いて解説してください。'
  )
  assert.equal(
    ja.ai.templates.rewritePrompt,
    '入力内容の意味を保ったまま、明確さと流れが良くなるように書き直してください。'
  )

  assert.equal(zh.ai.templates.translatePrompt, '请翻译输入内容。')
  assert.equal(zh.ai.templates.summarizePrompt, '请总结输入内容，并保留关键含义。')
  assert.equal(
    zh.ai.templates.explainPrompt,
    '请用平易近人的语言解释输入内容，拆解其中的复杂术语、结构或概念，使其易于理解。'
  )
  assert.equal(
    zh.ai.templates.rewritePrompt,
    '请改写输入内容，在保留原意的前提下提升清晰度与流畅度。'
  )
})

test('AI composer template resolution prefers selection, falls back to current block, enables slash-context transforms, and disables block-aware actions when no target is available', () => {
  const models = getAITemplateModels(t)
  const translate = models.find((model) => model.id === 'translate')
  const explain = models.find((model) => model.id === 'explain')

  assert.ok(translate)
  assert.ok(explain)
  assert.deepEqual(
    resolveAIComposerTemplateResolution(translate!, {
      hasSelection: true,
      hasCurrentBlock: true,
      hasSlashCommandContext: true,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'edit',
      scope: 'selection',
      outputTarget: 'replace-selection',
      enabled: true,
      targetKind: 'selection',
    }
  )
  assert.deepEqual(
    resolveAIComposerTemplateResolution(translate!, {
      hasSelection: false,
      hasCurrentBlock: true,
      hasSlashCommandContext: true,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'edit',
      scope: 'current-block',
      outputTarget: 'replace-current-block',
      enabled: true,
      targetKind: 'current-block',
    }
  )
  assert.deepEqual(
    resolveAIComposerTemplateResolution(explain!, {
      hasSelection: false,
      hasCurrentBlock: true,
      hasSlashCommandContext: true,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'ask',
      scope: 'current-block',
      outputTarget: 'chat-only',
      enabled: true,
      targetKind: 'current-block',
    }
  )
  assert.deepEqual(
    resolveAIComposerTemplateResolution(translate!, {
      hasSelection: false,
      hasCurrentBlock: false,
      hasSlashCommandContext: true,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'edit',
      scope: 'document',
      outputTarget: 'at-cursor',
      enabled: true,
      targetKind: 'slash-context',
    }
  )
  assert.deepEqual(
    resolveAIComposerTemplateResolution(explain!, {
      hasSelection: false,
      hasCurrentBlock: false,
      hasSlashCommandContext: true,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'ask',
      scope: 'document',
      outputTarget: 'chat-only',
      enabled: true,
      targetKind: 'slash-context',
    }
  )
  assert.deepEqual(
    resolveAIComposerTemplateResolution(translate!, {
      hasSelection: false,
      hasCurrentBlock: false,
      hasSlashCommandContext: false,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'edit',
      scope: 'current-block',
      outputTarget: 'replace-current-block',
      enabled: false,
      targetKind: null,
    }
  )
})

test('AI Composer suggestion chips expose reusable template entry points directly', async () => {
  const [composer, coreView] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /getAITemplateModels\(t\)/)
  assert.match(composer, /templateModels=\{templateModels\}/)
  assert.match(composer, /onSelectTemplate=\{applyTemplate\}/)
  assert.match(coreView, /<AIQuickChips/)
  assert.match(coreView, /function AIQuickChips\(/)
  assert.match(coreView, /AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER/)
  assert.match(coreView, /data-ai-template=\{template\.id\}/)
  assert.match(coreView, /t\('ai\.mode\.suggestions'\)/)
  assert.doesNotMatch(coreView, /data-ai-template-target=/)
  assert.doesNotMatch(coreView, /t\('ai\.mode\.target'\)/)
  assert.doesNotMatch(coreView, /t\('ai\.templateLibrary\.title'\)/)
})
