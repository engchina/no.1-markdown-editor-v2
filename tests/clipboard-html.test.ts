import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPlainTextClipboardHtml, renderClipboardHtmlFromMarkdown } from '../src/lib/clipboardHtml.ts'

test('buildPlainTextClipboardHtml preserves paragraphs and line breaks for plain text fallback', () => {
  const html = buildPlainTextClipboardHtml('Line 1\nLine 2\n\nLine 3')

  assert.equal(html, '<p>Line 1<br />Line 2</p><p>Line 3</p>')
})

test('renderClipboardHtmlFromMarkdown renders selection markdown into clipboard html', async () => {
  const html = await renderClipboardHtmlFromMarkdown('# Heading\n\n[Link](https://example.com)')

  assert.match(html, /<h1 id="heading">Heading<\/h1>/)
  assert.match(html, /<a href="https:\/\/example\.com">Link<\/a>/)
})
