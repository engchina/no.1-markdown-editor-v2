import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { renderMarkdown } from '../src/lib/markdown.ts'

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

test('editor store persists the preview line break mode and sanitizes invalid values', async () => {
  const store = await readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8')

  assert.match(store, /export type PreviewLineBreakMode = 'strict' \| 'visual-soft-breaks'/)
  assert.match(store, /previewLineBreakMode: PreviewLineBreakMode/)
  assert.match(store, /setPreviewLineBreakMode: \(mode: PreviewLineBreakMode\) => void/)
  assert.match(store, /previewLineBreakMode: 'visual-soft-breaks'/)
  assert.match(store, /hasExplicitPreviewLineBreakModePreference: false/)
  assert.match(
    store,
    /setPreviewLineBreakMode: \(previewLineBreakMode\) => set\(\{[\s\S]*previewLineBreakMode,[\s\S]*hasExplicitPreviewLineBreakModePreference: true,[\s\S]*\}\)/
  )
  assert.match(store, /previewLineBreakMode: s\.previewLineBreakMode/)
  assert.match(store, /hasExplicitPreviewLineBreakModePreference: s\.hasExplicitPreviewLineBreakModePreference/)
  assert.match(
    store,
    /previewLineBreakMode:\s*persistedState\?\.hasExplicitPreviewLineBreakModePreference[\s\S]*\? sanitizePreviewLineBreakMode\(persistedState\?\.previewLineBreakMode\)[\s\S]*: 'visual-soft-breaks'/
  )
})

test('theme panel surfaces the preview line break toggle and preview binds the visual class', async () => {
  const [panel, preview, css] = await Promise.all([
    readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Preview/MarkdownPreview.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
  ])

  assert.match(panel, /previewLineBreakMode/)
  assert.match(panel, /setPreviewLineBreakMode/)
  assert.match(panel, /t\('themePanel\.previewOptions'\)/)
  assert.match(panel, /t\('themePanel\.previewLineBreaks'\)/)
  assert.match(panel, /themePanel\.previewLineBreakModes\.strict/)
  assert.match(panel, /themePanel\.previewLineBreakModes\.visualSoftBreaks/)
  assert.match(preview, /const previewLineBreakMode = useEditorStore\(\(state\) => state\.previewLineBreakMode\)/)
  assert.match(preview, /markdown-preview--visual-soft-breaks/)
  assert.match(css, /\.markdown-preview--visual-soft-breaks :is\(p, td, th\)\s*\{[\s\S]*white-space:\s*pre-line;/u)
  assert.match(
    css,
    /\.markdown-preview--visual-soft-breaks li:not\(:has\(> :is\(p, ul, ol, pre, blockquote, table, hr, img, h1, h2, h3, h4, h5, h6, div, section, \.front-matter\)\)\)\s*\{[\s\S]*white-space:\s*pre-line;/u
  )
  assert.doesNotMatch(css, /\.markdown-preview--visual-soft-breaks :is\(p, li, td, th\)\s*\{/u)
})

test('visual soft break preview keeps loose markdown list wrappers from turning into visible blank lines', async () => {
  const html = await renderMarkdown([
    '- [Overview](#overview)',
    '- Block Elements',
    '',
    '  - [Paragraph and line breaks](#paragraph-and-line-breaks)',
    '  - [Headings](#headings)',
  ].join('\n'))

  assert.match(
    html,
    /<li>\s*<p><a href="#overview">Overview<\/a><\/p>\s*<\/li>\s*<li>\s*<p>Block Elements<\/p>\s*<ul>/u
  )
})

test('preview line break locale copy exists across en, ja, and zh', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const locales = [JSON.parse(enRaw), JSON.parse(jaRaw), JSON.parse(zhRaw)] as Array<Record<string, unknown>>
  const keys = [
    'themePanel.previewOptions',
    'themePanel.previewLineBreaks',
    'themePanel.previewLineBreakModes.strict',
    'themePanel.previewLineBreakModes.visualSoftBreaks',
    'themePanel.previewLineBreakHintStrict',
    'themePanel.previewLineBreakHintVisualSoftBreaks',
  ]

  for (const locale of locales) {
    for (const key of keys) {
      assert.equal(typeof getNestedValue(locale, key), 'string', key)
    }
  }
})

test('preview line break mode stays preview-only and does not leak into markdown, clipboard, or export pipelines', async () => {
  const [markdownSource, clipboardSource, exportSource] = await Promise.all([
    readFile(new URL('../src/lib/markdown.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/clipboardHtml.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useExport.ts', import.meta.url), 'utf8'),
  ])

  for (const source of [markdownSource, clipboardSource, exportSource]) {
    assert.doesNotMatch(source, /previewLineBreakMode/u)
    assert.doesNotMatch(source, /visual-soft-breaks/u)
  }
})
