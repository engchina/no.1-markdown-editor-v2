import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { isThematicBreakLine } from '../src/components/Editor/thematicBreak.ts'

test('isThematicBreakLine matches CommonMark-style horizontal rule lines', () => {
  assert.equal(isThematicBreakLine('***'), true)
  assert.equal(isThematicBreakLine('* * *'), true)
  assert.equal(isThematicBreakLine('  _ _ _  '), true)
  assert.equal(isThematicBreakLine('---'), true)
  assert.equal(isThematicBreakLine('- - -'), true)
})

test('isThematicBreakLine rejects non-rule content and code-block indentation', () => {
  assert.equal(isThematicBreakLine('**'), false)
  assert.equal(isThematicBreakLine('foo ***'), false)
  assert.equal(isThematicBreakLine('* *'), false)
  assert.equal(isThematicBreakLine('*-*'), false)
  assert.equal(isThematicBreakLine('    ***'), false)
})

test('wysiwyg editor routes horizontal rules through the shared thematic-break detector', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /class HrWidget extends WidgetType/u)
  assert.match(source, /rule\.className = 'cm-wysiwyg-hr__rule'/u)
  assert.match(source, /if \(isThematicBreakLine\(text\)\) \{/u)
  assert.match(source, /Decoration\.line\(\{ attributes: \{ class: 'cm-wysiwyg-hr-anchor-line' \} \}\)/u)
  assert.match(source, /Decoration\.replace\(\{ widget: new HrWidget\(\), block: false \}\)/u)
  assert.match(source, /isThematicBreakLine\(line\.text\)/u)
  assert.match(source, /stateSelectionTouchesRange\(state, line\.from, line\.to\)/u)
  assert.match(source, /'\.cm-wysiwyg-hr-anchor-line': \{[\s\S]*?padding: '0 !important'[\s\S]*?lineHeight: '0'[\s\S]*?fontSize: '0'/u)
  assert.match(source, /'\.cm-wysiwyg-hr': \{[\s\S]*?display: 'block'[\s\S]*?width: '100%'[\s\S]*?boxSizing: 'border-box'[\s\S]*?padding: '0 32px'[\s\S]*?pointerEvents: 'none'/u)
  assert.match(source, /'\.cm-wysiwyg-hr__rule': \{[\s\S]*?display: 'block'[\s\S]*?borderTop: '1px solid var\(--border\)'[\s\S]*?margin: '0\.75em 0'/u)
  assert.doesNotMatch(source, /border-top: 2px solid var\(--border\)/u)
  assert.doesNotMatch(source, /Decoration\.replace\(\{ widget: new HrWidget\(\), block: true \}\)/u)
})
