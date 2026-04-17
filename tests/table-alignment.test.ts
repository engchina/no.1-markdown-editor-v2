import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildStandaloneHtml, renderMarkdown } from '../src/lib/markdown.ts'

test('renderMarkdown preserves GFM table alignment markers as align attributes', async () => {
  const html = await renderMarkdown([
    '| Left | Center | Right |',
    '| :--- | :---: | ---: |',
    '| a | b | c |',
  ].join('\n'))

  assert.match(html, /<th align="left">Left<\/th>/)
  assert.match(html, /<th align="center">Center<\/th>/)
  assert.match(html, /<th align="right">Right<\/th>/)
  assert.match(html, /<td align="left">a<\/td>/)
  assert.match(html, /<td align="center">b<\/td>/)
  assert.match(html, /<td align="right">c<\/td>/)
})

test('preview styles explicitly honor left, center, and right table alignment attributes', () => {
  const css = readFileSync(new URL('../src/global.css', import.meta.url), 'utf8')

  assert.match(css, /\.markdown-preview th\[align="left"\],[\s\S]*text-align:\s*left;/)
  assert.match(css, /\.markdown-preview th\[align="center"\],[\s\S]*text-align:\s*center;/)
  assert.match(css, /\.markdown-preview th\[align="right"\],[\s\S]*text-align:\s*right;/)
  assert.match(css, /\.markdown-preview th:empty::before,[\s\S]*content:\s*'\\00a0';[\s\S]*display:\s*block;[\s\S]*visibility:\s*hidden;/)
})

test('standalone exports keep explicit table alignment rules', () => {
  const html = buildStandaloneHtml('Aligned table', '<table><tr><td align="center">x</td></tr></table>')

  assert.match(html, /th\[align="left"\], td\[align="left"\] \{ text-align: left; \}/)
  assert.match(html, /th\[align="center"\], td\[align="center"\] \{ text-align: center; \}/)
  assert.match(html, /th\[align="right"\], td\[align="right"\] \{ text-align: right; \}/)
  assert.match(html, /th:empty::before, td:empty::before \{ content: '\\00a0'; display: block; visibility: hidden; \}/)
})
