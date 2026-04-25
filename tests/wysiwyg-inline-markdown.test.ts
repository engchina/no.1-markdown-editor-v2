import assert from 'node:assert/strict'
import test from 'node:test'
import { renderInlineMarkdownFragment } from '../src/components/Editor/wysiwygInlineMarkdown.ts'

test('renderInlineMarkdownFragment renders inline markdown suitable for table cells', () => {
  const html = renderInlineMarkdownFragment('**Bold** and [link](https://example.com) plus $E=mc^2$')

  assert.match(html, /<strong>Bold<\/strong>/)
  assert.match(html, /<a href="https:\/\/example\.com">link<\/a>/)
  assert.match(html, /class="katex"/)
})

test('renderInlineMarkdownFragment renders autolink urls and emails for WYSIWYG inline fragments', () => {
  const html = renderInlineMarkdownFragment('Contact <i@typora.io> and www.google.com')

  assert.match(html, /<a href="mailto:i@typora\.io">i@typora\.io<\/a>/)
  assert.match(html, /<a href="http:\/\/www\.google\.com">www\.google\.com<\/a>/)
})

test('renderInlineMarkdownFragment preserves linked images and mixed link labels', () => {
  const html = renderInlineMarkdownFragment('[![img](https://example.com/logo.png)Oracle](https://example.com/org)')

  assert.match(html, /<a href="https:\/\/example\.com\/org">/u)
  assert.match(html, /<img src="https:\/\/example\.com\/logo\.png" alt="img">/u)
  assert.match(html, /Oracle<\/a>/u)
})

test('renderInlineMarkdownFragment resolves reference-style links when definitions are provided', () => {
  const html = renderInlineMarkdownFragment('This is [an example][id] reference-style link.', {
    referenceDefinitionsMarkdown: '[id]: http://example.com/ "Optional Title Here"',
  })

  assert.match(
    html,
    /This is <a href="http:\/\/example\.com\/" title="Optional Title Here">an example<\/a> reference-style link\./u
  )
})

test('renderInlineMarkdownFragment resolves reference-style linked media when definitions are provided', () => {
  const html = renderInlineMarkdownFragment('[![img][logo]Oracle][org]', {
    referenceDefinitionsMarkdown: [
      '[logo]: https://example.com/logo.png',
      '[org]: https://example.com/org',
    ].join('\n'),
  })

  assert.match(html, /<a href="https:\/\/example\.com\/org">/u)
  assert.match(html, /<img src="https:\/\/example\.com\/logo\.png" alt="img">/u)
  assert.match(html, /Oracle<\/a>/u)
})

test('renderInlineMarkdownFragment keeps code spans literal instead of rendering math inside them', () => {
  const html = renderInlineMarkdownFragment('Use `$E=mc^2$` literally')

  assert.match(html, /<code>\$E=mc\^2\$<\/code>/)
  assert.doesNotMatch(html, /class="katex"/)
})

test('renderInlineMarkdownFragment keeps single-tilde subscript distinct from double-tilde strikethrough', () => {
  const html = renderInlineMarkdownFragment('H~2~O and ~~Mistaken~~')

  assert.match(html, /H<sub>2<\/sub>O and <del>Mistaken<\/del>/)
})

test('renderInlineMarkdownFragment preserves inline html breaks for table cells', () => {
  const html = renderInlineMarkdownFragment('Line 1<br />Line 2')

  assert.match(html, /Line 1<br\s*\/?>Line 2/u)
})

test('renderInlineMarkdownFragment strips dangerous inline html while keeping safe text content', () => {
  const html = renderInlineMarkdownFragment('Safe <span>inline</span><script>bad()</script> text')

  assert.match(html, /Safe inline text/u)
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /bad\(\)/)
})

test('renderInlineMarkdownFragment preserves markdown hard breaks from backslashes and trailing spaces', () => {
  const backslashHtml = renderInlineMarkdownFragment('Line 1\\\nLine 2')
  const trailingSpaceHtml = renderInlineMarkdownFragment('Line 1  \nLine 2')

  assert.match(backslashHtml, /Line 1<br\s*\/?>\s*Line 2/u)
  assert.match(trailingSpaceHtml, /Line 1<br\s*\/?>\s*Line 2/u)
})

test('renderInlineMarkdownFragment can expose visible break markers for table-cell WYSIWYG rendering', () => {
  const html = renderInlineMarkdownFragment('Line 1<br />Line 2<br /><br />', {
    tableLineBreakMode: 'placeholder',
  })

  assert.doesNotMatch(html, /<br\s*\/?>/u)
  assert.match(html, /Line 1<span class="cm-wysiwyg-table__line-break-marker">&lt;br \/&gt;<\/span>Line 2/u)
  assert.equal((html.match(/cm-wysiwyg-table__line-break-marker/gu) ?? []).length, 3)
})
