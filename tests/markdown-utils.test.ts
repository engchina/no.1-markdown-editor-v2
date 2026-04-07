import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFrontMatterHtml,
  buildStandaloneHtml,
  renderMarkdown,
  stripFrontMatter,
} from '../src/lib/markdown.ts'
import { containsLikelyRawHtml } from '../src/lib/markdownHtml.ts'
import { getInlineKatexCss } from '../src/lib/katexInlineCss.ts'
import { containsLikelyMath } from '../src/lib/markdownMath.ts'
import { renderMarkdownInWorker } from '../src/lib/markdownWorker.ts'

test('stripFrontMatter parses CRLF front matter blocks', () => {
  const markdown = ['---', 'title: "Hello"', 'lang: en', '---', '', '# Body'].join('\r\n')
  const result = stripFrontMatter(markdown)

  assert.deepEqual(result.meta, { title: 'Hello', lang: 'en' })
  assert.equal(result.body, '# Body')
})

test('buildFrontMatterHtml escapes metadata values', () => {
  const html = buildFrontMatterHtml({
    title: '<unsafe>',
    author: '"Ada" & Bob',
  })

  assert.match(html, /&lt;unsafe&gt;/)
  assert.match(html, /&quot;Ada&quot; &amp; Bob/)
  assert.doesNotMatch(html, /<unsafe>/)
})

test('renderMarkdown sanitizes scripts but keeps data images and heading ids', async () => {
  const markdown = [
    '---',
    'title: Demo',
    '---',
    '',
    '# Hello',
    '',
    '<script>alert(1)</script>',
    '',
    '![img](data:image/png;base64,abc)',
  ].join('\n')

  const html = await renderMarkdown(markdown)

  assert.match(html, /class="front-matter"/)
  assert.match(html, /<h1 id="hello">Hello<\/h1>/)
  assert.match(html, /src="data:image\/png;base64,abc"/)
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /alert\(1\)/)
})

test('renderMarkdown renders KaTeX when the markdown body contains math', async () => {
  const html = await renderMarkdown('Inline $E=mc^2$ example')

  assert.match(html, /class="katex"/)
})

test('renderMarkdown ignores front matter values when choosing the math path', async () => {
  const markdown = ['---', 'price: "$19.99"', '---', '', 'Plain body'].join('\n')
  const html = await renderMarkdown(markdown)

  assert.doesNotMatch(html, /class="katex"/)
  assert.match(html, /<p>Plain body<\/p>/)
})

test('containsLikelyRawHtml detects actual html but ignores plain angle brackets', () => {
  assert.equal(containsLikelyRawHtml('2 < 3 and 5 > 4'), false)
  assert.equal(containsLikelyRawHtml('Hello <span>world</span>'), true)
  assert.equal(containsLikelyRawHtml('<!-- comment -->\nText'), true)
  assert.equal(containsLikelyRawHtml('<https://example.com>'), false)
  assert.equal(containsLikelyRawHtml('<hello@example.com>'), false)
})

test('renderMarkdown keeps safe raw html while stripping scripts', async () => {
  const html = await renderMarkdown('Hello <span>world</span><script>alert(1)</script>')

  assert.match(html, /<span>world<\/span>/)
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /alert\(1\)/)
})

test('buildStandaloneHtml escapes the document title', () => {
  const html = buildStandaloneHtml('<bad "title">', '<p>Body</p>')

  assert.match(html, /<title>&lt;bad &quot;title&quot;&gt;<\/title>/)
  assert.match(html, /<p>Body<\/p>/)
  assert.doesNotMatch(html, /katex\.min\.css/)
})

test('buildStandaloneHtml includes KaTeX styles when rendered math is present', () => {
  const html = buildStandaloneHtml('Math', '<div class="katex">x</div>')

  assert.match(html, /katex\.min\.css/)
})

test('buildStandaloneHtml can inline KaTeX styles for offline exports', () => {
  const html = buildStandaloneHtml('Math', '<div class="katex">x</div>', {
    inlineKatexCss: '.katex{color:red;}',
  })

  assert.match(html, /data-katex-inline/)
  assert.match(html, /\.katex\{color:red;\}/)
  assert.doesNotMatch(html, /cdn\.jsdelivr/)
})

test('getInlineKatexCss replaces KaTeX font urls with data urls', async () => {
  const css = await getInlineKatexCss()

  assert.match(css, /data:font\/woff2;base64,/)
  assert.doesNotMatch(css, /\/assets\/KaTeX_/)
  assert.doesNotMatch(css, /fonts\/KaTeX_/)
})

test('containsLikelyMath detects inline, block, and fenced math', () => {
  assert.equal(containsLikelyMath('Price is $19.99'), false)
  assert.equal(containsLikelyMath('Inline $E=mc^2$ example'), true)
  assert.equal(containsLikelyMath('$$\na^2 + b^2 = c^2\n$$'), true)
  assert.equal(containsLikelyMath('```math\nx = y + z\n```'), true)
})

test('renderMarkdownInWorker keeps the worker-safe path free of KaTeX rendering', async () => {
  const html = await renderMarkdownInWorker('Inline $E=mc^2$')

  assert.match(html, /\$E=mc\^2\$/)
  assert.doesNotMatch(html, /class="katex"/)
})

test('renderMarkdownInWorker supports sanitized raw html when needed', async () => {
  const html = await renderMarkdownInWorker('Hello <span>worker</span><script>bad()</script>')

  assert.match(html, /<span>worker<\/span>/)
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /bad\(\)/)
})
