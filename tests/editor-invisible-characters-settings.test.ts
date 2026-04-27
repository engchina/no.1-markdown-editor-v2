import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildInvisibleCharacterExtensions } from '../src/components/Editor/extensions.ts'

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

test('buildInvisibleCharacterExtensions scopes visual aids by editing mode', () => {
  assert.equal(buildInvisibleCharacterExtensions(false).length, 0)
  assert.equal(buildInvisibleCharacterExtensions(true).length, 2)
  assert.equal(buildInvisibleCharacterExtensions(true, { activeLineOnly: true }).length, 2)
})

test('editor store persists invisible-character mode and CodeMirror wires it through a dedicated compartment', async () => {
  const [store, editor, extensions] = await Promise.all([
    readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/extensions.ts', import.meta.url), 'utf8'),
  ])

  assert.match(store, /showInvisibleCharacters: boolean/)
  assert.match(store, /setShowInvisibleCharacters: \(v: boolean\) => void/)
  assert.match(store, /showInvisibleCharacters: false/)
  assert.match(store, /setShowInvisibleCharacters: \(showInvisibleCharacters\) => set\(\{ showInvisibleCharacters \}\)/)
  assert.match(store, /showInvisibleCharacters: s\.showInvisibleCharacters/)
  assert.match(store, /showInvisibleCharacters: persistedState\?\.showInvisibleCharacters === true/)

  assert.match(editor, /const invisibleCharactersCompartmentRef = useRef\(new Compartment\(\)\)/)
  assert.match(editor, /const showInvisibleCharacters = useEditorStore\(\(state\) => state\.showInvisibleCharacters\)/)
  assert.match(
    editor,
    /invisibleCharactersCompartmentRef\.current\.of\(\s*buildInvisibleCharacterExtensions\(showInvisibleCharacters, \{ activeLineOnly: wysiwygMode \}\)\s*\)/
  )
  assert.match(
    editor,
    /reconfigure\(\s*invisibleCharactersCompartmentRef\.current,\s*buildInvisibleCharacterExtensions\(showInvisibleCharacters, \{ activeLineOnly: wysiwygMode \}\)\s*\)/
  )
  assert.match(editor, /\[reconfigure, showInvisibleCharacters, wysiwygMode\]/)

  assert.match(
    extensions,
    /export function buildInvisibleCharacterExtensions\(\s*enabled: boolean,\s*options: \{ activeLineOnly\?: boolean \} = \{\}\s*\): Extension\[]/
  )
  assert.match(extensions, /const trailingSpaceDecorator = createTrailingSpaceDecorator\(\)/)
  assert.match(extensions, /const activeLineTrailingSpaceDecorator = createTrailingSpaceDecorator\(\{ activeLineOnly: true \}\)/)
  assert.match(extensions, /const activeLineSpecialCharDecorator = new MatchDecorator\(\{/)
  assert.match(extensions, /regexp: \/ \+\(\?=\[\\t \]\*\$\)\/g/)
  assert.match(extensions, /if \(options\.activeLineOnly && !rangeStartsOnFocusedCursorLine\(view, from\)\) return/)
  assert.match(extensions, /function rangeStartsOnFocusedCursorLine\(view: EditorView, from: number\): boolean/)
  assert.match(extensions, /if \(!view\.hasFocus\) return false/)
  assert.match(extensions, /const cursorLine = view\.state\.doc\.lineAt\(range\.head\)\.number/)
  assert.match(extensions, /return lineNumber === cursorLine/)
  assert.doesNotMatch(extensions, /selectionFromLine/)
  assert.doesNotMatch(extensions, /selectionToLine/)
  assert.match(extensions, /for \(let pos = from; pos < to; pos \+= 1\) \{/)
  assert.match(extensions, /add\(pos, pos \+ 1, trailingSpaceMark\)/)
  assert.match(extensions, /class InvisibleTabWidget extends WidgetType/)
  assert.match(extensions, /countColumn\(line\.text, view\.state\.tabSize, from - line\.from\)/)
  assert.match(extensions, /class InvisibleSpecialCharWidget extends WidgetType/)
  assert.match(extensions, /refreshOnSelectionSet && \(update\.selectionSet \|\| update\.focusChanged\)/)
  assert.doesNotMatch(extensions, /highlightTrailingWhitespace\(\)/)
  assert.match(extensions, /highlightSpecialChars\(\{/)
  assert.match(extensions, /addSpecialChars: INVISIBLE_MARKDOWN_SPECIAL_CHARS/)
  assert.match(
    extensions,
    /options\.activeLineOnly\s*\?\s*buildMatchDecoratorExtension\(activeLineSpecialCharDecorator, \{ refreshOnSelectionSet: true \}\)\s*:\s*highlightSpecialChars/
  )
})

test('theme panel, locale copy, and editor styles explain the invisible-character mode clearly', async () => {
  const [panel, css, enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  assert.match(panel, /showInvisibleCharacters/)
  assert.match(panel, /setShowInvisibleCharacters/)
  assert.match(panel, /t\('themePanel\.showInvisibleCharacters'\)/)
  assert.match(panel, /t\('themePanel\.showInvisibleCharactersHint'\)/)

  assert.match(css, /\.cm-tab\s*\{/)
  assert.match(css, /\.cm-tab::after\s*\{/)
  assert.match(css, /\.cm-trailingSpace\s*\{/)
  assert.match(css, /\.cm-specialChar\s*\{/)
  assert.match(css, /--editor-invisible-ink:\s*color-mix\(in srgb, var\(--accent\) 18%, var\(--text-muted\)\);/)
  assert.match(css, /--editor-invisible-soft:\s*color-mix\(in srgb, var\(--accent\) 8%, transparent\);/)
  assert.match(css, /--editor-invisible-trailing:\s*color-mix\(in srgb, var\(--accent\) 26%, var\(--text-muted\)\);/)
  assert.match(css, /\.cm-tab\s*\{[\s\S]*background-image:/)
  assert.match(css, /\.cm-trailingSpace\s*\{[\s\S]*radial-gradient\(/)
  assert.match(css, /\.cm-trailingSpace\s*\{[\s\S]*background-repeat:\s*no-repeat;/)
  assert.match(css, /\.cm-trailingSpace\s*\{[\s\S]*background-size:\s*100% 1em;/)
  assert.match(css, /\.cm-specialChar\s*\{[\s\S]*display:\s*inline-block/)
  assert.match(css, /\.cm-specialChar\s*\{[\s\S]*background:\s*none;/)
  assert.match(css, /\.cm-specialChar\s*\{[\s\S]*box-shadow:\s*none;/)
  assert.match(css, /\.cm-specialChar\s*\{[\s\S]*color:\s*var\(--editor-invisible-ink\) !important;/)

  const locales = [JSON.parse(enRaw), JSON.parse(jaRaw), JSON.parse(zhRaw)] as Array<Record<string, unknown>>
  const keys = [
    'themePanel.showInvisibleCharacters',
    'themePanel.showInvisibleCharactersHint',
  ]

  for (const locale of locales) {
    for (const key of keys) {
      assert.equal(typeof getNestedValue(locale, key), 'string', key)
    }
  }
})

test('invisible-character mode stays inside the source editor and does not leak into markdown, clipboard, or export pipelines', async () => {
  const [markdownSource, clipboardSource, exportSource, previewSource] = await Promise.all([
    readFile(new URL('../src/lib/markdown.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/clipboardHtml.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useExport.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Preview/MarkdownPreview.tsx', import.meta.url), 'utf8'),
  ])

  for (const source of [markdownSource, clipboardSource, exportSource, previewSource]) {
    assert.doesNotMatch(source, /showInvisibleCharacters/u)
  }
})
