import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildAIComposerPromptPlaceholder } from '../src/lib/ai/templateLibrary.ts'

function collectNestedKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  const entries = Object.entries(value as Record<string, unknown>)
  return entries.flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key
    const nested = collectNestedKeys(child, next)
    return nested.length > 0 ? nested : [next]
  })
}

function pickAiSubset(locale: Record<string, unknown>) {
  return {
    ai: locale.ai,
    commands: Object.fromEntries(
      Object.entries((locale.commands ?? {}) as Record<string, unknown>).filter(([key]) => key.startsWith('ai'))
    ),
    notices: Object.fromEntries(
      Object.entries((locale.notices ?? {}) as Record<string, unknown>).filter(([key]) => key.startsWith('ai'))
    ),
  }
}

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

function createLocaleTranslate(locale: Record<string, unknown>) {
  return (key: string, options: Record<string, unknown> = {}) => {
    const value = getNestedValue(locale, key)
    assert.equal(typeof value, 'string', `Missing locale key: ${key}`)
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''))
  }
}

test('AI copy is structurally complete across en, ja, and zh locales', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const en = pickAiSubset(JSON.parse(enRaw))
  const ja = pickAiSubset(JSON.parse(jaRaw))
  const zh = pickAiSubset(JSON.parse(zhRaw))

  const enKeys = collectNestedKeys(en).sort()
  const jaKeys = collectNestedKeys(ja).sort()
  const zhKeys = collectNestedKeys(zh).sort()

  assert.deepEqual(jaKeys, enKeys)
  assert.deepEqual(zhKeys, enKeys)
})

test('AI composer prompt placeholder follows the suggestion chip order across locales', async () => {
  const [enRaw, jaRaw, zhRaw, composerRaw, coreViewRaw, templateLibraryRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/ai/templateLibrary.ts', import.meta.url), 'utf8'),
  ])

  const en = JSON.parse(enRaw) as Record<string, unknown>
  const ja = JSON.parse(jaRaw) as Record<string, unknown>
  const zh = JSON.parse(zhRaw) as Record<string, unknown>

  assert.match(composerRaw, /buildAIComposerPromptPlaceholder\(t\)/)
  assert.match(coreViewRaw, /AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER/)
  assert.match(templateLibraryRaw, /AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER/)

  assert.equal(
    buildAIComposerPromptPlaceholder(createLocaleTranslate(en)),
    'Translate, Summarize, Explain, or Rewrite for Clarity...'
  )
  assert.equal(buildAIComposerPromptPlaceholder(createLocaleTranslate(ja)), '翻訳、要約、説明、または読みやすく書き直す...')
  assert.equal(buildAIComposerPromptPlaceholder(createLocaleTranslate(zh)), '翻译、总结提炼、解释或改写润色...')
})

test('AI locales remove sidebar-specific copy while keeping the remaining source labels', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const en = JSON.parse(enRaw) as Record<string, unknown>
  const ja = JSON.parse(jaRaw) as Record<string, unknown>
  const zh = JSON.parse(zhRaw) as Record<string, unknown>

  for (const locale of [en, ja, zh]) {
    assert.equal(getNestedValue(locale, 'sidebar.ai'), undefined)
    assert.equal(getNestedValue(locale, 'ai.sidebar'), undefined)
    assert.equal(getNestedValue(locale, 'ai.source.sidebar-tab'), undefined)
    assert.equal(typeof getNestedValue(locale, 'ai.source.shortcut'), 'string')
    assert.equal(typeof getNestedValue(locale, 'ai.source.command-palette'), 'string')
    assert.equal(typeof getNestedValue(locale, 'ai.source.slash-command'), 'string')
  }
})

test('AI slash-context copy stays concise across locales for single-line composer hints', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const en = JSON.parse(enRaw) as Record<string, unknown>
  const ja = JSON.parse(jaRaw) as Record<string, unknown>
  const zh = JSON.parse(zhRaw) as Record<string, unknown>

  for (const locale of [en, ja, zh]) {
    const attachedMessage = getNestedValue(locale, 'ai.slashContext.attachedMessage')
    const emptyMessage = getNestedValue(locale, 'ai.slashContext.emptyMessage')

    assert.equal(typeof attachedMessage, 'string')
    assert.equal(typeof emptyMessage, 'string')
    assert.equal((attachedMessage as string).includes('\n'), false)
    assert.equal((emptyMessage as string).includes('\n'), false)
    assert.ok((attachedMessage as string).length <= 48)
    assert.ok((emptyMessage as string).length <= 32)
  }
})
