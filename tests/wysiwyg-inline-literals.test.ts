import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { collectInlineLiteralEscapeRanges } from '../src/components/Editor/wysiwygInlineLiterals.ts'

test('collectInlineLiteralEscapeRanges identifies escaped inline markdown markers but ignores plain backslashes', () => {
  assert.deepEqual(
    collectInlineLiteralEscapeRanges(String.raw`\*literal asterisks\*`),
    [
      { from: 0, to: 1 },
      { from: 19, to: 20 },
    ]
  )
  assert.deepEqual(collectInlineLiteralEscapeRanges(String.raw`\displaylines{x+y\\y+z}`), [])
})

test('source-mode inline rendering integrates literal escape hiding after inline syntax passes', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /const inlineCodeRanges = collectInlineCodeRanges\(text\)/u)
  assert.match(
    source,
    /const inlineLiteralExcludedRanges = \[[\s\S]*?\.\.\.inlineCodeRanges,[\s\S]*?findInlineMathRanges\(text\)\.map/u
  )
  assert.match(source, /processLiteralEscapes\(decorations, text, lineFrom, inlineLiteralExcludedRanges\)/u)
  assert.match(
    source,
    /function processLiteralEscapes\([\s\S]*?collectInlineLiteralEscapeRanges\(text, excludedRanges\)[\s\S]*?Decoration\.replace\(\{\}\)/u
  )
  assert.match(
    source,
    /const inlineMediaRanges = collectInlineMediaRanges\(text, \{\s*referenceDefinitionsMarkdown: documentContext\.referenceDefinitionsMarkdown,\s*\}\)/u
  )
  assert.match(
    source,
    /for \(const range of inlineMediaRanges\.renderedFragments\) \{[\s\S]*?InlineRenderedFragmentWidget/u
  )
  assert.match(
    source,
    /for \(const range of inlineMediaRanges\.links\) \{[\s\S]*?Decoration\.mark\(\{ class: 'cm-wysiwyg-link' \}\)/u
  )
})
