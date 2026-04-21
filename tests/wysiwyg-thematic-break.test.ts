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

  assert.match(source, /if \(isThematicBreakLine\(text\)\) \{/u)
})
