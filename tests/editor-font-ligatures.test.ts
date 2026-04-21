import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('CodeMirror source editor disables ligatures so markdown punctuation stays literal', async () => {
  const source = await readFile(new URL('../src/global.css', import.meta.url), 'utf8')

  assert.match(source, /\.cm-editor \{[\s\S]*?font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;/u)
  assert.match(source, /\.cm-editor \{[\s\S]*?font-variant-ligatures: none;/u)
  assert.match(source, /\.cm-editor \{[\s\S]*?font-feature-settings: "liga" 0, "calt" 0;/u)
})
