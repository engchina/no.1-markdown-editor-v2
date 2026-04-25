import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

test('editor store persists spellcheck mode and sanitizes invalid values', async () => {
  const store = await readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8')

  assert.match(store, /import type \{ SpellcheckMode \} from '\.\.\/lib\/documentLanguage\.ts'/)
  assert.match(store, /spellcheckMode: SpellcheckMode/)
  assert.match(store, /setSpellcheckMode: \(mode: SpellcheckMode\) => void/)
  assert.match(store, /function sanitizeSpellcheckMode\(value: unknown\): SpellcheckMode/)
  assert.match(store, /case 'system':/)
  assert.match(store, /case 'off':/)
  assert.match(store, /case 'document-language':/)
  assert.match(store, /spellcheckMode: 'document-language'/)
  assert.match(store, /setSpellcheckMode: \(spellcheckMode\) => set\(\{ spellcheckMode \}\)/)
  assert.match(store, /spellcheckMode: s\.spellcheckMode/)
  assert.match(store, /spellcheckMode: sanitizeSpellcheckMode\(persistedState\?\.spellcheckMode\)/)
})

test('CodeMirror and WYSIWYG reuse shared document language and spellcheck config', async () => {
  const [editor, wysiwyg, aiContext] = await Promise.all([
    readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/ai/context.ts', import.meta.url), 'utf8'),
  ])

  assert.match(editor, /detectDocumentLanguage/)
  assert.match(editor, /resolveDocumentSpellcheckConfig/)
  assert.match(editor, /const spellcheckMode = useEditorStore\(\(state\) => state\.spellcheckMode\)/)
  assert.match(editor, /const documentLanguage = detectDocumentLanguage\(content\)/)
  assert.match(editor, /const spellcheckConfig = resolveDocumentSpellcheckConfig\(documentLanguage, spellcheckMode\)/)
  assert.match(editor, /applySpellcheckConfigToEditable\(view\.contentDOM, spellcheckConfig\)/)
  assert.match(editor, /function applySpellcheckConfigToEditable\(/)
  assert.match(editor, /element\.spellcheck = config\.spellcheck/)
  assert.match(editor, /element\.setAttribute\('lang', config\.lang\)/)
  assert.match(editor, /element\.removeAttribute\('lang'\)/)

  assert.match(wysiwyg, /detectDocumentLanguage/)
  assert.match(wysiwyg, /resolveDocumentSpellcheckConfig/)
  assert.match(wysiwyg, /useEditorStore\.getState\(\)\.spellcheckMode/)
  assert.match(wysiwyg, /input\.spellcheck = spellcheckConfig\.spellcheck/)
  assert.match(wysiwyg, /input\.setAttribute\('lang', spellcheckConfig\.lang\)/)
  assert.match(wysiwyg, /input\.removeAttribute\('lang'\)/)

  assert.match(aiContext, /import \{ detectDocumentLanguage \} from '\.\.\/documentLanguage\.ts'/)
  assert.match(aiContext, /documentLanguage: detectDocumentLanguage\(content\)/)
  assert.doesNotMatch(aiContext, /detectAIDocumentLanguage/)
})

test('theme panel and locales surface the spellcheck mode clearly', async () => {
  const [panel, enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  assert.match(panel, /spellcheckMode/)
  assert.match(panel, /setSpellcheckMode/)
  assert.match(panel, /t\('themePanel\.spellcheck'\)/)
  assert.match(panel, /themePanel\.spellcheckModes\.document-language/)
  assert.match(panel, /themePanel\.spellcheckModes\.system/)
  assert.match(panel, /themePanel\.spellcheckModes\.off/)
  assert.match(panel, /themePanel\.spellcheckHintDocumentLanguage/)
  assert.match(panel, /themePanel\.spellcheckHintSystem/)
  assert.match(panel, /themePanel\.spellcheckHintOff/)

  const locales = [JSON.parse(enRaw), JSON.parse(jaRaw), JSON.parse(zhRaw)] as Array<Record<string, unknown>>
  const keys = [
    'themePanel.spellcheck',
    'themePanel.spellcheckModes.document-language',
    'themePanel.spellcheckModes.system',
    'themePanel.spellcheckModes.off',
    'themePanel.spellcheckHintDocumentLanguage',
    'themePanel.spellcheckHintSystem',
    'themePanel.spellcheckHintOff',
  ]

  for (const locale of locales) {
    for (const key of keys) {
      assert.equal(typeof getNestedValue(locale, key), 'string', key)
    }
  }
})
