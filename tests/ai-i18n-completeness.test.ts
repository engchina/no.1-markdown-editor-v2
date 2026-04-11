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
  const [enRaw, jaRaw, zhRaw, composerRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
  ])

  const en = JSON.parse(enRaw) as Record<string, unknown>
  const ja = JSON.parse(jaRaw) as Record<string, unknown>
  const zh = JSON.parse(zhRaw) as Record<string, unknown>

  assert.match(composerRaw, /buildAIComposerPromptPlaceholder\(t\)/)
  assert.match(composerRaw, /AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER/)

  assert.equal(
    buildAIComposerPromptPlaceholder(createLocaleTranslate(en)),
    'Translate, Summarize, Explain, or Rewrite for Clarity...'
  )
  assert.equal(buildAIComposerPromptPlaceholder(createLocaleTranslate(ja)), '翻訳、要約、説明、または読みやすく書き直す...')
  assert.equal(buildAIComposerPromptPlaceholder(createLocaleTranslate(zh)), '翻译、总结提炼、解释或改写润色...')
})

test('AI sidebar status copy describes the document session instead of generic readiness', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const en = JSON.parse(enRaw) as Record<string, unknown>
  const ja = JSON.parse(jaRaw) as Record<string, unknown>
  const zh = JSON.parse(zhRaw) as Record<string, unknown>

  assert.equal(getNestedValue(en, 'ai.sidebar.activeStatus'), 'Document Session')
  assert.equal(getNestedValue(en, 'ai.sidebar.statusReady'), 'Idle')
  assert.equal(getNestedValue(en, 'ai.sidebar.statusOpen'), 'Awaiting Run')
  assert.equal(getNestedValue(en, 'ai.sidebar.statusStreaming'), 'Generating')
  assert.equal(getNestedValue(en, 'ai.sidebar.statusError'), 'Request Failed')

  assert.equal(getNestedValue(ja, 'ai.sidebar.activeStatus'), 'ドキュメント セッション')
  assert.equal(getNestedValue(ja, 'ai.sidebar.statusReady'), '待機中')
  assert.equal(getNestedValue(ja, 'ai.sidebar.statusOpen'), '実行待ち')
  assert.equal(getNestedValue(ja, 'ai.sidebar.statusStreaming'), '生成中')
  assert.equal(getNestedValue(ja, 'ai.sidebar.statusError'), 'リクエスト失敗')

  assert.equal(getNestedValue(zh, 'ai.sidebar.activeStatus'), '文档会话')
  assert.equal(getNestedValue(zh, 'ai.sidebar.statusReady'), '空闲中')
  assert.equal(getNestedValue(zh, 'ai.sidebar.statusOpen'), '等待运行')
  assert.equal(getNestedValue(zh, 'ai.sidebar.statusStreaming'), '生成中')
  assert.equal(getNestedValue(zh, 'ai.sidebar.statusError'), '请求失败')
})
