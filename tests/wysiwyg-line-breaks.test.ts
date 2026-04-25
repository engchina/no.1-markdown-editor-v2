import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { collectInlineHardBreakTokens } from '../src/components/Editor/wysiwygHardBreak.ts'

test('collectInlineHardBreakTokens recognizes html, backslash, and trailing-space hard breaks while preserving terminal literals', () => {
  const inlineHtml = 'Line 1<br />Line 2'
  const terminalHtml = 'Line 1<br />'
  const markdownBackslash = 'Line 1\\'
  const markdownTrailingSpaces = 'Line 1  '

  assert.deepEqual(
    collectInlineHardBreakTokens(inlineHtml),
    [
      {
        from: inlineHtml.indexOf('<br />'),
        to: inlineHtml.indexOf('<br />') + '<br />'.length,
        renderWidget: true,
      },
    ]
  )
  assert.deepEqual(
    collectInlineHardBreakTokens(terminalHtml),
    [
      {
        from: terminalHtml.indexOf('<br />'),
        to: terminalHtml.length,
        renderWidget: false,
      },
    ]
  )
  assert.deepEqual(
    collectInlineHardBreakTokens(terminalHtml, [], { hasFollowingLine: false }),
    [
      {
        from: terminalHtml.indexOf('<br />'),
        to: terminalHtml.length,
        renderWidget: true,
      },
    ]
  )
  assert.deepEqual(
    collectInlineHardBreakTokens(markdownBackslash),
    [
      {
        from: markdownBackslash.length - 1,
        to: markdownBackslash.length,
        renderWidget: false,
      },
    ]
  )
  assert.deepEqual(
    collectInlineHardBreakTokens(markdownTrailingSpaces),
    [
      {
        from: markdownTrailingSpaces.length - 2,
        to: markdownTrailingSpaces.length,
        renderWidget: false,
      },
    ]
  )
  assert.deepEqual(collectInlineHardBreakTokens(markdownBackslash, [], { hasFollowingLine: false }), [])
  assert.deepEqual(collectInlineHardBreakTokens(markdownTrailingSpaces, [], { hasFollowingLine: false }), [])
})

test('collectInlineHardBreakTokens ignores explicit hard-break syntax inside excluded literal ranges', () => {
  const htmlBreak = '`<br />`'
  const backslashBreak = '`value\\`'
  const trailingSpaceBreak = '`value  `'

  assert.deepEqual(
    collectInlineHardBreakTokens(htmlBreak, [{ from: 0, to: htmlBreak.length }]),
    []
  )
  assert.deepEqual(
    collectInlineHardBreakTokens(backslashBreak, [{ from: 0, to: backslashBreak.length }]),
    []
  )
  assert.deepEqual(
    collectInlineHardBreakTokens(trailingSpaceBreak, [{ from: 0, to: trailingSpaceBreak.length }]),
    []
  )
})

test('wysiwyg live preview routes supported hard-break syntaxes through the shared collector', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /class HardBreakWidget extends WidgetType/u)
  assert.match(source, /document\.createElement\('br'\)/u)
  assert.match(source, /el\.className = 'cm-wysiwyg-hard-break'/u)
  assert.match(source, /import \{ collectInlineHardBreakTokens \} from '\.\/wysiwygHardBreak\.ts'/u)
  assert.match(source, /function processInlineHardBreaks\(/u)
  assert.match(source, /collectInlineHardBreakTokens\(text, excludedRanges, \{ hasFollowingLine \}\)/u)
  assert.match(source, /token\.renderWidget\s*\?\s*Decoration\.replace\(\{ widget: new HardBreakWidget\(\) \}\)\s*:\s*Decoration\.replace\(\{\}\)/u)
  assert.match(source, /processInline\(decorations, text, lineFrom, line\.number < doc\.lines, footnoteIndices, documentContext\)/u)
})

test('wysiwyg task checkbox keyboard toggles only on plain Enter or Space so Shift+Enter remains available for line breaks', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /function isPlainTaskCheckboxToggleKey\(event: KeyboardEvent\): boolean \{/u)
  assert.match(source, /!event\.shiftKey/u)
  assert.match(source, /\(event\.key === ' ' \|\| event\.key === 'Enter'\)/u)
  assert.match(source, /if \(!isPlainTaskCheckboxToggleKey\(event\)\) return false/u)
})
