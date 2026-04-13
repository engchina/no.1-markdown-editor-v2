import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMarkdownSafeClipboardPayload,
  buildPlainTextClipboardHtml,
  buildRichClipboardPayload,
  renderClipboardHtmlFromMarkdown,
} from '../src/lib/clipboardHtml.ts'

test('buildPlainTextClipboardHtml preserves paragraphs and line breaks for plain text fallback', () => {
  const html = buildPlainTextClipboardHtml('Line 1\nLine 2\n\nLine 3')

  assert.equal(html, '<p>Line 1<br />Line 2</p><p>Line 3</p>')
})

test('buildMarkdownSafeClipboardPayload preserves literal markdown links and footnotes', () => {
  const payload = buildMarkdownSafeClipboardPayload(
    [
      '# Welcome',
      '',
      '一个具有注脚的文本。[^1]',
      '',
      '[Jump](#welcome)',
      '',
      '[Doc](./guide.md)',
      '',
      '[Site](https://example.com/docs)',
      '',
      '[^1]: 注脚的解释',
    ].join('\n')
  )

  assert.equal(
    payload.plainText,
    [
      '# Welcome',
      '',
      '一个具有注脚的文本。[^1]',
      '',
      '[Jump](#welcome)',
      '',
      '[Doc](./guide.md)',
      '',
      '[Site](https://example.com/docs)',
      '',
      '[^1]: 注脚的解释',
    ].join('\n')
  )
  assert.match(payload.html, /# Welcome/)
  assert.match(payload.html, /\[Jump]\(#welcome\)/)
  assert.match(payload.html, /\[Doc]\(\.\/guide\.md\)/)
  assert.match(payload.html, /\[Site]\(https:\/\/example\.com\/docs\)/)
  assert.match(payload.html, /\[\^1]: 注脚的解释/)
  assert.doesNotMatch(payload.html, /<a href=/)
  assert.doesNotMatch(payload.html, /data-footnote-ref/)
})

test('buildRichClipboardPayload renders selection markdown into rich clipboard html', async () => {
  const payload = await buildRichClipboardPayload('# Heading\n\n[Link](https://example.com)')

  assert.equal(payload.plainText, '# Heading\n\n[Link](https://example.com)')
  assert.match(payload.html, /<h1 id="heading">Heading<\/h1>/)
  assert.match(payload.html, /<a href="https:\/\/example\.com">Link<\/a>/)
})

test('renderClipboardHtmlFromMarkdown keeps footnote links as document fragments', async () => {
  const html = await renderClipboardHtmlFromMarkdown('一个具有注脚的文本。[^1]\n\n[^1]: 注脚的解释')

  assert.match(html, /href="#user-content-fn-1"/)
  assert.match(html, /href="#user-content-fnref-1"/)
  assert.doesNotMatch(html, /http:\/\/127\.0\.0\.1:1420/)
})
