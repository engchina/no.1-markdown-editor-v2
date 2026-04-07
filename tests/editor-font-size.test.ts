import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('CodeMirror editor typography inherits the configured font size', () => {
  const css = readFileSync(new URL('../src/global.css', import.meta.url), 'utf8')

  assert.match(css, /\.cm-editor\s*\{[\s\S]*font-size:\s*inherit;/)
  assert.doesNotMatch(css, /\.cm-editor\s*\{[\s\S]*font-size:\s*14\.5px;/)
  assert.match(css, /\.cm-scroller\s*\{[\s\S]*font-size:\s*inherit\s*!important;/)
})
