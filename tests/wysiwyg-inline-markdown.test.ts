import assert from 'node:assert/strict'
import test from 'node:test'
import { renderInlineMarkdownFragment } from '../src/components/Editor/wysiwygInlineMarkdown.ts'

test('renderInlineMarkdownFragment renders inline markdown suitable for table cells', () => {
  const html = renderInlineMarkdownFragment('**Bold** and [link](https://example.com) plus $E=mc^2$')

  assert.match(html, /<strong>Bold<\/strong>/)
  assert.match(html, /<a href="https:\/\/example\.com">link<\/a>/)
  assert.match(html, /class="katex"/)
})

test('renderInlineMarkdownFragment keeps code spans literal instead of rendering math inside them', () => {
  const html = renderInlineMarkdownFragment('Use `$E=mc^2$` literally')

  assert.match(html, /<code>\$E=mc\^2\$<\/code>/)
  assert.doesNotMatch(html, /class="katex"/)
})

test('renderInlineMarkdownFragment preserves inline html breaks for table cells', () => {
  const html = renderInlineMarkdownFragment('Line 1<br />Line 2')

  assert.match(html, /Line 1<br\s*\/?>Line 2/u)
})

test('renderInlineMarkdownFragment can expose visible break markers for table-cell WYSIWYG rendering', () => {
  const html = renderInlineMarkdownFragment('Line 1<br />Line 2<br /><br />', {
    tableLineBreakMode: 'placeholder',
  })

  assert.doesNotMatch(html, /<br\s*\/?>/u)
  assert.match(html, /Line 1<span class="cm-wysiwyg-table__line-break-marker">&lt;br \/&gt;<\/span>Line 2/u)
  assert.equal((html.match(/cm-wysiwyg-table__line-break-marker/gu) ?? []).length, 3)
})
