import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildStandaloneHtml,
  renderMarkdown,
  stripFrontMatter,
} from '../src/lib/markdown.ts'
import { containsLikelyRawHtml } from '../src/lib/markdownHtml.ts'
import { resolveTyporaRootUrlAsset } from '../src/lib/imageRoots.ts'
import { getInlineKatexCss } from '../src/lib/katexInlineCss.ts'
import { containsLikelyMath } from '../src/lib/markdownMath.ts'
import { isExternalImageSource, rewritePreviewHtmlExternalImages } from '../src/lib/previewExternalImages.ts'
import {
  buildLocalPreviewImageKey,
  isLocalPreviewImageSource,
  rewritePreviewHtmlLocalImages,
} from '../src/lib/previewLocalImages.ts'
import { buildFrontMatterHtml } from '../src/lib/markdownShared.ts'
import { renderMarkdownInWorker } from '../src/lib/markdownWorker.ts'
import { extractHeadings } from '../src/lib/outline.ts'

function countRenderedBreaks(html: string): number {
  return html.match(/<br\s*\/?>/g)?.length ?? 0
}

function countRenderedParagraphs(html: string): number {
  return html.match(/<p>/g)?.length ?? 0
}

function extractHeadingIds(html: string): string[] {
  return Array.from(html.matchAll(/<h[1-6]\s+id="([^"]*)"/g), (match) => match[1])
}

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

test('renderMarkdown keeps single newlines as soft paragraph breaks', async () => {
  const html = await renderMarkdown('Line 1\nLine 2\nLine 3')

  assert.equal(countRenderedBreaks(html), 0)
  assert.equal(countRenderedParagraphs(html), 1)
  assert.match(html, /<p>Line 1\s*Line 2\s*Line 3<\/p>/)
})

test('renderMarkdown uses blank lines to separate paragraphs and ignores extra empty lines', async () => {
  const html = await renderMarkdown('A\n\n\nB\n')

  assert.equal(countRenderedBreaks(html), 0)
  assert.equal(countRenderedParagraphs(html), 2)
  assert.match(html, /<p>A<\/p>\s*<p>B<\/p>/)
})

test('renderMarkdown preserves explicit hard breaks from Markdown and br tags', async () => {
  const markdownHardBreakHtml = await renderMarkdown('Line 1  \nLine 2')
  const markdownBackslashBreakHtml = await renderMarkdown('Line 1\\\nLine 2')
  const htmlHardBreakHtml = await renderMarkdown('Line 1<br />\nLine 2')

  assert.equal(countRenderedBreaks(markdownHardBreakHtml), 1)
  assert.match(markdownHardBreakHtml, /<p>Line 1<br\s*\/?>\s*Line 2<\/p>/)
  assert.equal(countRenderedBreaks(markdownBackslashBreakHtml), 1)
  assert.match(markdownBackslashBreakHtml, /<p>Line 1<br\s*\/?>\s*Line 2<\/p>/)
  assert.equal(countRenderedBreaks(htmlHardBreakHtml), 1)
  assert.match(htmlHardBreakHtml, /<p>Line 1<br\s*\/?>\s*Line 2<\/p>/)
})

test('renderMarkdown renders angle-bracket URLs and emails in preview and worker output', async () => {
  const markdown = 'For example <i@typora.io> and <https://example.com>'
  const html = await renderMarkdown(markdown)
  const workerHtml = await renderMarkdownInWorker(markdown)

  assert.match(html, /<a href="mailto:i@typora\.io">i@typora\.io<\/a>/)
  assert.match(html, /<a href="https:\/\/example\.com">https:\/\/example\.com<\/a>/)
  assert.match(workerHtml, /<a href="mailto:i@typora\.io">i@typora\.io<\/a>/)
  assert.match(workerHtml, /<a href="https:\/\/example\.com">https:\/\/example\.com<\/a>/)
})

test('renderMarkdown renders GFM autolink literals in preview and worker output', async () => {
  const markdown = 'Contact i@typora.io or www.google.com'
  const html = await renderMarkdown(markdown)
  const workerHtml = await renderMarkdownInWorker(markdown)

  assert.match(html, /<a href="mailto:i@typora\.io">i@typora\.io<\/a>/)
  assert.match(html, /<a href="http:\/\/www\.google\.com">www\.google\.com<\/a>/)
  assert.match(workerHtml, /<a href="mailto:i@typora\.io">i@typora\.io<\/a>/)
  assert.match(workerHtml, /<a href="http:\/\/www\.google\.com">www\.google\.com<\/a>/)
})

test('renderMarkdown keeps preview heading ids aligned with outline ids for non-Latin and symbol-only titles', async () => {
  const markdown = [
    '# デ',
    '# -',
    '# *',
    '# プ',
    '# Café',
  ].join('\n')

  const expectedIds = extractHeadings(markdown).map((heading) => heading.id)
  const html = await renderMarkdown(markdown)
  const workerHtml = await renderMarkdownInWorker(markdown)

  assert.deepEqual(extractHeadingIds(html), expectedIds)
  assert.deepEqual(extractHeadingIds(workerHtml), expectedIds)
})

test('renderMarkdown keeps single newlines soft when raw html is present', async () => {
  const html = await renderMarkdown('Line 1\n<span>Inline</span>\nLine 3')

  assert.equal(countRenderedBreaks(html), 0)
  assert.equal(countRenderedParagraphs(html), 1)
  assert.match(html, /<p>Line 1\s*<span>Inline<\/span>\s*Line 3<\/p>/)
})

test('renderMarkdown keeps single newlines soft when math is present', async () => {
  const html = await renderMarkdown('Top\nInline $E=mc^2$\nBottom')

  assert.equal(countRenderedBreaks(html), 0)
  assert.equal(countRenderedParagraphs(html), 1)
  assert.match(html, /class="katex"/)
})

test('containsLikelyRawHtml detects actual html but ignores plain angle brackets', () => {
  assert.equal(containsLikelyRawHtml('2 < 3 and 5 > 4'), false)
  assert.equal(containsLikelyRawHtml('Hello <span>world</span>'), true)
  assert.equal(containsLikelyRawHtml('Hello<br />world'), true)
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

test('renderMarkdown preserves underline tags inserted for markdown formatting', async () => {
  const html = await renderMarkdown('Hello <u>world</u>')

  assert.match(html, /<p>Hello <u>world<\/u><\/p>/)
})

test('renderMarkdown preserves highlight tags inserted from pasted html', async () => {
  const html = await renderMarkdown('Hello <mark>world</mark>')

  assert.match(html, /<p>Hello <mark>world<\/mark><\/p>/)
})

test('renderMarkdown renders superscript markers in both preview and worker output', async () => {
  const html = await renderMarkdown('2^10^')
  const workerHtml = await renderMarkdownInWorker('2^10^')

  assert.match(html, /<p>2<sup>10<\/sup><\/p>/)
  assert.match(workerHtml, /<p>2<sup>10<\/sup><\/p>/)
})

test('renderMarkdown keeps single-tilde subscript distinct from double-tilde strikethrough in preview and worker output', async () => {
  const html = await renderMarkdown('H~2~O and ~~Mistaken~~')
  const workerHtml = await renderMarkdownInWorker('H~2~O and ~~Mistaken~~')

  assert.match(html, /<p>H<sub>2<\/sub>O and <del>Mistaken<\/del><\/p>/)
  assert.match(workerHtml, /<p>H<sub>2<\/sub>O and <del>Mistaken<\/del><\/p>/)
})

test('renderMarkdown keeps escaped and invalid superscript markers literal', async () => {
  const escapedHtml = await renderMarkdown('\\^text^')
  const leadingSpaceHtml = await renderMarkdown('^ leading^')
  const trailingSpaceHtml = await renderMarkdown('^trailing ^')
  const unclosedHtml = await renderMarkdown('^text')

  assert.match(escapedHtml, /<p>\^text\^<\/p>/)
  assert.doesNotMatch(escapedHtml, /<sup>/)
  assert.match(leadingSpaceHtml, /<p>\^ leading\^<\/p>/)
  assert.doesNotMatch(leadingSpaceHtml, /<sup>/)
  assert.match(trailingSpaceHtml, /<p>\^trailing \^<\/p>/)
  assert.doesNotMatch(trailingSpaceHtml, /<sup>/)
  assert.match(unclosedHtml, /<p>\^text<\/p>/)
  assert.doesNotMatch(unclosedHtml, /<sup>/)
})

test('renderMarkdown keeps escaped and invalid subscript markers literal', async () => {
  const escapedHtml = await renderMarkdown('\\~text~')
  const leadingSpaceHtml = await renderMarkdown('~ leading~')
  const trailingSpaceHtml = await renderMarkdown('~trailing ~')
  const doubleTildeHtml = await renderMarkdown('~~text~~')
  const unclosedHtml = await renderMarkdown('~text')

  assert.match(escapedHtml, /<p>~text~<\/p>/)
  assert.doesNotMatch(escapedHtml, /<sub>/)
  assert.match(leadingSpaceHtml, /<p>~ leading~<\/p>/)
  assert.doesNotMatch(leadingSpaceHtml, /<sub>/)
  assert.match(trailingSpaceHtml, /<p>~trailing ~<\/p>/)
  assert.doesNotMatch(trailingSpaceHtml, /<sub>/)
  assert.match(doubleTildeHtml, /<p><del>text<\/del><\/p>/)
  assert.doesNotMatch(doubleTildeHtml, /<sub>/)
  assert.match(unclosedHtml, /<p>~text<\/p>/)
  assert.doesNotMatch(unclosedHtml, /<sub>/)
})

test('renderMarkdown converts ==highlight== syntax to mark tags across inline nodes', async () => {
  const markdown = 'Hello ==**world**=='
  const html = await renderMarkdown(markdown)
  const workerHtml = await renderMarkdownInWorker(markdown)

  assert.match(html, /<p>Hello <mark><strong>world<\/strong><\/mark><\/p>/)
  assert.match(workerHtml, /<p>Hello <mark><strong>world<\/strong><\/mark><\/p>/)
})

test('renderMarkdown keeps superscript markers out of code and inline math while preserving nested inline formatting', async () => {
  const inlineCodeHtml = await renderMarkdown('`a^2^`')
  const fencedCodeHtml = await renderMarkdown('```\na^2^\n```')
  const mixedHtml = await renderMarkdown('Inline $a^2$ and 2^10^ plus x^*2*^ and y^**3**^')
  const workerMathHtml = await renderMarkdownInWorker('Inline $a^2$ and 2^10^')

  assert.match(inlineCodeHtml, /<code>a\^2\^<\/code>/)
  assert.doesNotMatch(inlineCodeHtml, /<sup>2<\/sup>/)
  assert.match(fencedCodeHtml, /a\^2\^/)
  assert.doesNotMatch(fencedCodeHtml, /<sup>2<\/sup>/)
  assert.match(mixedHtml, /class="katex"/)
  assert.match(mixedHtml, /2<sup>10<\/sup>/)
  assert.match(mixedHtml, /x<sup><em>2<\/em><\/sup>/)
  assert.match(mixedHtml, /y<sup><strong>3<\/strong><\/sup>/)
  assert.match(workerMathHtml, /class="katex"/)
  assert.match(workerMathHtml, /2<sup>10<\/sup>/)
})

test('renderMarkdown keeps subscript markers out of code and inline math while preserving nested inline formatting', async () => {
  const inlineCodeHtml = await renderMarkdown('`H~2~O`')
  const fencedCodeHtml = await renderMarkdown('```\nH~2~O\n```')
  const mixedHtml = await renderMarkdown('Inline $H~2~O$ and H~2~O plus x~*2*~ and y~**3**~')
  const workerMathHtml = await renderMarkdownInWorker('Inline $H~2~O$ and H~2~O')

  assert.match(inlineCodeHtml, /<code>H~2~O<\/code>/)
  assert.doesNotMatch(inlineCodeHtml, /H<sub>2<\/sub>O/)
  assert.match(fencedCodeHtml, /H~2~O/)
  assert.doesNotMatch(fencedCodeHtml, /H<sub>2<\/sub>O/)
  assert.match(mixedHtml, /class="katex"/)
  assert.match(mixedHtml, /H<sub>2<\/sub>O/)
  assert.match(mixedHtml, /x<sub><em>2<\/em><\/sub>/)
  assert.match(mixedHtml, /y<sub><strong>3<\/strong><\/sub>/)
  assert.match(workerMathHtml, /class="katex"/)
  assert.match(workerMathHtml, /H<sub>2<\/sub>O/)
})

test('renderMarkdown preserves footnotes while rendering superscript in surrounding text and footnote content', async () => {
  const html = await renderMarkdown('Power 2^10^ and note[^1]\n\n[^1]: Footnote 3^2^')

  assert.match(html, /Power 2<sup>10<\/sup> and note<sup><a[^>]*data-footnote-ref/)
  assert.match(html, /data-footnotes/)
  assert.match(html, /Footnote 3<sup>2<\/sup>/)
})

test('renderMarkdown keeps semantic task list html for preview checkbox styling', async () => {
  const html = await renderMarkdown([
    '- [ ] Draft release notes',
    '- [x] Ship 0.17.2',
  ].join('\n'))

  assert.match(html, /class="contains-task-list"/)
  assert.match(html, /class="task-list-item"/)
  assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled[^>]*>/)
  assert.match(html, /<input[^>]*type="checkbox"[^>]*checked[^>]*disabled[^>]*>/)
})

test('renderMarkdown keeps linked remote images from pasted web content', async () => {
  const markdown = '[![img](https://example.com/assets/hero.png)](https://example.com/assets/hero.png)'
  const html = await renderMarkdown(markdown)

  assert.match(html, /<a href="https:\/\/example.com\/assets\/hero\.png"><img/)
  assert.match(html, /src="https:\/\/example.com\/assets\/hero\.png"/)
})

test('renderMarkdown resolves typora-root-url for markdown image sources', async () => {
  const markdown = ['---', 'typora-root-url: https://assets.example.com/posts', '---', '', '![Cover](cover.png)'].join('\n')
  const html = await renderMarkdown(markdown)

  assert.match(html, /src="https:\/\/assets\.example\.com\/posts\/cover\.png"/)
})

test('renderMarkdown resolves typora-root-url for raw html image sources', async () => {
  const markdown = [
    '---',
    'typora-root-url: http://cdn.example.com/content',
    '---',
    '',
    '<img src="hero/banner.jpg" alt="Banner">',
  ].join('\n')

  const html = await renderMarkdown(markdown)

  assert.match(html, /src="http:\/\/cdn\.example\.com\/content\/hero\/banner\.jpg"/)
})

test('renderMarkdown preserves Windows absolute markdown image sources by normalizing them to file urls', async () => {
  const html = await renderMarkdown('![Windows image](C:/Users/thinkpad/Pictures/hero-image.png)')

  assert.match(html, /src="file:\/\/\/C:\/Users\/thinkpad\/Pictures\/hero-image\.png"/)
})

test('renderMarkdown preserves angle-wrapped absolute markdown image sources that contain spaces', async () => {
  const html = await renderMarkdown(
    '![Draft image](</Users/test/Library/Application Support/com.no1.markdown-editor/draft-images/tab-1/image-17.png>)'
  )

  assert.match(
    html,
    /src="\/Users\/test\/Library\/Application%20Support\/com\.no1\.markdown-editor\/draft-images\/tab-1\/image-17\.png"/
  )
})

test('renderMarkdown preserves Windows absolute raw html image sources by normalizing them to file urls', async () => {
  const html = await renderMarkdown('<img src="C:/Users/thinkpad/Pictures/raw-hero.png" alt="Hero">')

  assert.match(html, /src="file:\/\/\/C:\/Users\/thinkpad\/Pictures\/raw-hero\.png"/)
})

test('renderMarkdown keeps Windows absolute markdown image sources when the math renderer is active', async () => {
  const html = await renderMarkdown('Inline $E=mc^2$\n\n![Windows image](C:/Users/thinkpad/Pictures/math-hero.png)')

  assert.match(html, /class="katex"/)
  assert.match(html, /src="file:\/\/\/C:\/Users\/thinkpad\/Pictures\/math-hero\.png"/)
})

test('resolveTyporaRootUrlAsset keeps absolute sources untouched and resolves relative ones', () => {
  assert.equal(resolveTyporaRootUrlAsset('cover.png', 'https://assets.example.com/posts'), 'https://assets.example.com/posts/cover.png')
  assert.equal(resolveTyporaRootUrlAsset('http://example.com/hero.png', 'https://assets.example.com/posts'), 'http://example.com/hero.png')
  assert.equal(resolveTyporaRootUrlAsset('data:image/png;base64,abc', 'https://assets.example.com/posts'), 'data:image/png;base64,abc')
})

test('rewritePreviewHtmlExternalImages keeps https remote images intact on http origins', () => {
  const html =
    '<p><a href="https://example.com/full.png"><img src="https://example.com/assets/hero.png" alt="Hero"></a></p>'

  const previewHtml = rewritePreviewHtmlExternalImages(
    html,
    {
      blockedLabel: 'External image blocked',
      clickLabel: 'Click to load from the original host',
    },
    'http://127.0.0.1:1420'
  )

  assert.match(previewHtml, /src="https:\/\/example.com\/assets\/hero.png"/)
  assert.doesNotMatch(previewHtml, /data-external-src=/)
  assert.doesNotMatch(previewHtml, /data-external-image=/)
  assert.match(previewHtml, /loading="lazy"/)
  assert.match(previewHtml, /decoding="async"/)
})

test('rewritePreviewHtmlExternalImages keeps https remote images intact on secure origins by default', () => {
  const html = '<p><img src="https://example.com/assets/hero.png" alt="Hero"></p>'

  const previewHtml = rewritePreviewHtmlExternalImages(
    html,
    {
      blockedLabel: 'External image blocked',
      clickLabel: 'Click to load from the original host',
    },
    'https://tauri.localhost'
  )

  assert.match(previewHtml, /src="https:\/\/example.com\/assets\/hero.png"/)
  assert.doesNotMatch(previewHtml, /data-external-src=/)
  assert.doesNotMatch(previewHtml, /data-external-image=/)
  assert.match(previewHtml, /loading="lazy"/)
  assert.match(previewHtml, /decoding="async"/)
})

test('rewritePreviewHtmlExternalImages keeps Qiita imgix https images intact on secure origins by default', () => {
  const html =
    '<p><img src="https://qiita-user-profile-images.imgix.net/https%3A%2F%2Fs3-ap-northeast-1.amazonaws.com%2Fqiita-image-store%2F0%2F3019263%2Fcf8b4a590c8d2b5d6f5fb822a7c4fe2fc99f7a0a%2Flarge.png%3F1679539184?ixlib=rb-4.0.0&auto=compress%2Cformat&lossless=0&w=128&s=f41c61e068526a590437568722a23e48" alt="Kazmorita"></p>'

  const previewHtml = rewritePreviewHtmlExternalImages(
    html,
    {
      blockedLabel: 'External image blocked',
      clickLabel: 'Click to load from the original host',
    },
    'https://tauri.localhost'
  )

  assert.match(previewHtml, /src="https:\/\/qiita-user-profile-images\.imgix\.net\//)
  assert.doesNotMatch(previewHtml, /data-external-src=/)
  assert.doesNotMatch(previewHtml, /data-external-image=/)
  assert.match(previewHtml, /loading="lazy"/)
  assert.match(previewHtml, /decoding="async"/)
})

test('rewritePreviewHtmlExternalImages adds direct-load fallback metadata for secure external images when requested', () => {
  const html = '<p><img src="https://img-home.csdnimg.cn/images/20220524100510.png" alt="Alt"></p>'

  const previewHtml = rewritePreviewHtmlExternalImages(
    html,
    {
      blockedLabel: 'External image blocked',
      clickLabel: 'Click to load from the original host',
    },
    'https://tauri.localhost',
    { enableDirectExternalImageFallback: true }
  )

  assert.match(previewHtml, /src="https:\/\/img-home\.csdnimg\.cn\/images\/20220524100510\.png"/)
  assert.match(previewHtml, /data-external-fallback-src="https:\/\/img-home\.csdnimg\.cn\/images\/20220524100510\.png"/)
  assert.match(previewHtml, /data-external-fallback-host="img-home\.csdnimg\.cn"/)
  assert.doesNotMatch(previewHtml, /data-external-src=/)
  assert.doesNotMatch(previewHtml, /data-external-image="blocked"/)
  assert.match(previewHtml, /loading="lazy"/)
  assert.match(previewHtml, /decoding="async"/)
})

test('rewritePreviewHtmlExternalImages removes direct-load fallback metadata after bridge resolution', () => {
  const html = '<p><img src="https://img-home.csdnimg.cn/images/20220524100510.png" alt="Alt"></p>'

  const previewHtml = rewritePreviewHtmlExternalImages(
    html,
    {
      blockedLabel: 'External image blocked',
      clickLabel: 'Click to load from the original host',
    },
    'https://tauri.localhost',
    {
      enableDirectExternalImageFallback: true,
      resolvedImages: {
        'https://img-home.csdnimg.cn/images/20220524100510.png': 'data:image/png;base64,abc',
      },
    }
  )

  assert.match(previewHtml, /src="data:image\/png;base64,abc"/)
  assert.doesNotMatch(previewHtml, /data-external-fallback-src=/)
  assert.doesNotMatch(previewHtml, /data-external-fallback-host=/)
  assert.doesNotMatch(previewHtml, /data-external-fallback-state=/)
})

test('rewritePreviewHtmlExternalImages bridges secure remote images when requested', () => {
  const html = '<p><img src="https://example.com/assets/hero.png" alt="Hero"></p>'

  const previewHtml = rewritePreviewHtmlExternalImages(
    html,
    {
      blockedLabel: 'External image blocked',
      clickLabel: 'Click to load from the original host',
    },
    'https://tauri.localhost',
    { bridgeAllExternalImages: true }
  )

  assert.match(previewHtml, /src="data:image\/svg\+xml/)
  assert.match(previewHtml, /data-external-src="https:\/\/example.com\/assets\/hero.png"/)
  assert.match(previewHtml, /data-external-image="blocked"/)
  assert.match(previewHtml, /class="[^"]*preview-external-image/)
  assert.match(previewHtml, /referrerpolicy="no-referrer"/)
  assert.match(previewHtml, /loading="lazy"/)
  assert.match(previewHtml, /decoding="async"/)
})

test('rewritePreviewHtmlExternalImages restores resolved bridged sources', () => {
  const html = '<p><img src="https://example.com/assets/hero.png" alt="Hero"></p>'

  const previewHtml = rewritePreviewHtmlExternalImages(
    html,
    {
      blockedLabel: 'External image blocked',
      clickLabel: 'Click to load from the original host',
    },
    'https://tauri.localhost',
    {
      bridgeAllExternalImages: true,
      resolvedImages: {
        'https://example.com/assets/hero.png': 'data:image/png;base64,abc',
      },
    }
  )

  assert.match(previewHtml, /src="data:image\/png;base64,abc"/)
  assert.doesNotMatch(previewHtml, /data-external-src=/)
  assert.doesNotMatch(previewHtml, /data-external-image=/)
  assert.doesNotMatch(previewHtml, /preview-external-image/)
  assert.doesNotMatch(previewHtml, /referrerpolicy=/)
  assert.match(previewHtml, /loading="lazy"/)
  assert.match(previewHtml, /decoding="async"/)
})

test('rewritePreviewHtmlExternalImages bridges insecure http images on secure origins', () => {
  const html = '<p><img src="http://example.com/assets/hero.png" alt="Hero"></p>'

  const previewHtml = rewritePreviewHtmlExternalImages(
    html,
    {
      blockedLabel: 'External image blocked',
      clickLabel: 'Click to load from the original host',
    },
    'https://tauri.localhost'
  )

  assert.match(previewHtml, /src="data:image\/svg\+xml/)
  assert.match(previewHtml, /data-external-src="http:\/\/example.com\/assets\/hero.png"/)
  assert.match(previewHtml, /data-external-image="blocked"/)
  assert.match(previewHtml, /class="[^"]*preview-external-image/)
  assert.match(previewHtml, /referrerpolicy="no-referrer"/)
  assert.match(previewHtml, /loading="lazy"/)
  assert.match(previewHtml, /decoding="async"/)
})

test('rewritePreviewHtmlExternalImages keeps same-origin and data images intact', () => {
  const html = [
    '<p><img src="http://127.0.0.1:1420/assets/logo.png" alt="Logo"></p>',
    '<p><img src="data:image/png;base64,abc" alt="Embedded"></p>',
  ].join('')

  const previewHtml = rewritePreviewHtmlExternalImages(
    html,
    {
      blockedLabel: 'External image blocked',
      clickLabel: 'Click to load from the original host',
    },
    'http://127.0.0.1:1420'
  )

  assert.match(previewHtml, /src="http:\/\/127.0.0.1:1420\/assets\/logo.png"/)
  assert.match(previewHtml, /src="data:image\/png;base64,abc"/)
  assert.doesNotMatch(previewHtml, /data-external-src=/)
  assert.match(previewHtml, /loading="lazy"/)
  assert.match(previewHtml, /decoding="async"/)
})

test('isExternalImageSource only flags cross-origin http and https urls', () => {
  assert.equal(isExternalImageSource('https://example.com/image.png', 'http://127.0.0.1:1420'), true)
  assert.equal(isExternalImageSource('/assets/logo.png', 'http://127.0.0.1:1420'), false)
  assert.equal(isExternalImageSource('http://127.0.0.1:1420/assets/logo.png', 'http://127.0.0.1:1420'), false)
  assert.equal(isExternalImageSource('data:image/png;base64,abc', 'http://127.0.0.1:1420'), false)
})

test('rewritePreviewHtmlLocalImages rewrites relative local images when the active document has a path', () => {
  const previewHtml = rewritePreviewHtmlLocalImages('<p><img src="./images/hero.png" alt="Hero"></p>', {
    documentPath: 'D:\\tmp\\draft.md',
  })

  assert.match(previewHtml, /src="data:image\/svg\+xml/)
  assert.match(previewHtml, /data-local-src="\.\/images\/hero\.png"/)
  assert.match(previewHtml, /data-local-image="pending"/)
})

test('rewritePreviewHtmlLocalImages treats images and ./images as the same relative local asset', () => {
  const documentPath = 'D:\\tmp\\draft.md'
  const resolvedImages = {
    [buildLocalPreviewImageKey('./images/hero.png', documentPath)]: 'data:image/png;base64,abc',
  }

  const previewHtml = rewritePreviewHtmlLocalImages('<p><img src="images/hero.png" alt="Hero"></p>', {
    documentPath,
    resolvedImages,
  })

  assert.match(previewHtml, /src="data:image\/png;base64,abc"/)
  assert.doesNotMatch(previewHtml, /data-local-src=/)
})

test('rewritePreviewHtmlLocalImages rewrites absolute local and file url images but keeps remote sources intact', () => {
  const previewHtml = rewritePreviewHtmlLocalImages(
    [
      '<p><img src="C:\\docs\\hero.png" alt="Hero"></p>',
      '<p><img src="file:///C:/docs/cover.png" alt="Cover"></p>',
      '<p><img src="https://example.com/remote.png" alt="Remote"></p>',
      '<p><img src="//cdn.example.com/protocol-relative.png" alt="Protocol relative"></p>',
    ].join(''),
    { documentPath: null }
  )

  assert.match(previewHtml, /data-local-src="C:\\docs\\hero\.png"/)
  assert.match(previewHtml, /data-local-src="file:\/\/\/C:\/docs\/cover\.png"/)
  assert.match(previewHtml, /src="https:\/\/example\.com\/remote\.png"/)
  assert.match(previewHtml, /src="\/\/cdn\.example\.com\/protocol-relative\.png"/)
  assert.doesNotMatch(previewHtml, /data-local-src="https:\/\/example\.com\/remote\.png"/)
})

test('isLocalPreviewImageSource only accepts local paths that the preview can resolve', () => {
  assert.equal(isLocalPreviewImageSource('./images/hero.png', 'D:\\tmp\\draft.md'), true)
  assert.equal(isLocalPreviewImageSource('images/hero.png', 'D:\\tmp\\draft.md'), true)
  assert.equal(isLocalPreviewImageSource('./images/hero.png', null), false)
  assert.equal(isLocalPreviewImageSource('C:\\docs\\hero.png', null), true)
  assert.equal(isLocalPreviewImageSource('file:///C:/docs/hero.png', null), true)
  assert.equal(isLocalPreviewImageSource('https://example.com/hero.png', 'D:\\tmp\\draft.md'), false)
  assert.equal(isLocalPreviewImageSource('//cdn.example.com/hero.png', 'D:\\tmp\\draft.md'), false)
  assert.equal(isLocalPreviewImageSource('data:image/png;base64,abc', 'D:\\tmp\\draft.md'), false)
})

test('buildLocalPreviewImageKey normalizes equivalent relative local image paths', () => {
  const documentPath = 'D:\\tmp\\draft.md'

  assert.equal(
    buildLocalPreviewImageKey('./images/hero.png', documentPath),
    buildLocalPreviewImageKey('images/hero.png', documentPath)
  )
  assert.equal(
    buildLocalPreviewImageKey('./images\\hero.png', documentPath),
    buildLocalPreviewImageKey('images/hero.png', documentPath)
  )
})

test('buildStandaloneHtml escapes the document title', () => {
  const html = buildStandaloneHtml('<bad "title">', '<p>Body</p>')

  assert.match(html, /<title>&lt;bad &quot;title&quot;&gt;<\/title>/)
  assert.match(html, /<p>Body<\/p>/)
  assert.doesNotMatch(html, /katex\.min\.css/)
})

test('buildStandaloneHtml does not add divider borders to headings', () => {
  const html = buildStandaloneHtml('Heading styles', '<h1>Title</h1><h2>Subtitle</h2>')

  assert.doesNotMatch(html, /h1, h2, h3, h4, h5, h6 \{[^}]*border-bottom:/)
  assert.doesNotMatch(html, /h1, h2, h3, h4, h5, h6 \{[^}]*padding-bottom:/)
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

test('buildStandaloneHtml falls back to Untitled for empty titles', () => {
  const html = buildStandaloneHtml('   ', '<p>Body</p>')

  assert.match(html, /<title>Untitled<\/title>/)
})

test('buildStandaloneHtml ships @page rules and print-safe overrides for PDF export', () => {
  const html = buildStandaloneHtml('Print', '<p>Body</p>')

  assert.match(html, /@page \{ size: A4; margin: 18mm 16mm; \}/)
  assert.match(html, /@media print \{[\s\S]*break-inside: avoid/)
})

test('buildStandaloneHtml inlines highlight.js token colors for exported code blocks', () => {
  const html = buildStandaloneHtml(
    'Code',
    '<pre><code class="hljs"><span class="hljs-keyword">const</span></code></pre>'
  )

  assert.match(html, /\.hljs-keyword[^}]*#f97316/)
  assert.match(html, /\.hljs \{ color: inherit; background: transparent; \}/)
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
  assert.equal(containsLikelyMath('Literal `$E=mc^2$` example'), false)
  assert.equal(containsLikelyMath('$$\na^2 + b^2 = c^2\n$$'), true)
  assert.equal(containsLikelyMath('```math\nx = y + z\n```'), true)
})

test('renderMarkdown keeps inline code literals around math markers instead of rendering KaTeX inside code spans', async () => {
  const html = await renderMarkdown('Literal `$E=mc^2$` example')

  assert.match(html, /<code>\$E=mc\^2\$<\/code>/)
  assert.doesNotMatch(html, /class="katex"/)
})

test('renderMarkdown can load Shiki on demand for fenced code blocks', async () => {
  const html = await renderMarkdown('```ts\nconst answer = 42\n```', 'shiki')

  assert.match(html, /class="shiki/)
  assert.match(html, /answer/)
})

test('renderMarkdown falls back to highlight.js for fenced languages outside the curated Shiki bundle', async () => {
  const html = await renderMarkdown('```cpp\nint main() { return 0; }\n```', 'shiki')

  assert.match(html, /class="hljs/)
  assert.match(html, /language-cpp/)
  assert.doesNotMatch(html, /class="shiki/)
})

test('renderMarkdownInWorker renders KaTeX when the markdown body contains math', async () => {
  const html = await renderMarkdownInWorker('Inline $E=mc^2$')

  assert.match(html, /class="katex"/)
})

test('renderMarkdownInWorker keeps math rendering compatible with sanitized raw html', async () => {
  const html = await renderMarkdownInWorker('Inline $E=mc^2$ and <span>safe</span><script>bad()</script>')

  assert.match(html, /class="katex"/)
  assert.match(html, /<span>safe<\/span>/)
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /bad\(\)/)
})

test('renderMarkdownInWorker can load Shiki on demand for fenced code blocks', async () => {
  const html = await renderMarkdownInWorker('```js\nconsole.log("worker")\n```', 'shiki')

  assert.match(html, /class="shiki/)
  assert.match(html, /console/)
})

test('renderMarkdownInWorker falls back to highlight.js for fenced languages outside the curated Shiki bundle', async () => {
  const html = await renderMarkdownInWorker('```cpp\nint worker() { return 0; }\n```', 'shiki')

  assert.match(html, /class="hljs/)
  assert.match(html, /language-cpp/)
  assert.doesNotMatch(html, /class="shiki/)
})

test('renderMarkdownInWorker preserves Windows absolute markdown image sources by normalizing them to file urls', async () => {
  const html = await renderMarkdownInWorker('![Worker image](C:/Users/thinkpad/Pictures/worker-hero.png)')

  assert.match(html, /src="file:\/\/\/C:\/Users\/thinkpad\/Pictures\/worker-hero\.png"/)
})

test('renderMarkdownInWorker preserves Windows absolute raw html image sources by normalizing them to file urls', async () => {
  const html = await renderMarkdownInWorker('<img src="C:/Users/thinkpad/Pictures/worker-raw.png" alt="Worker Hero">')

  assert.match(html, /src="file:\/\/\/C:\/Users\/thinkpad\/Pictures\/worker-raw\.png"/)
})

test('renderMarkdownInWorker keeps single newlines as soft paragraph breaks', async () => {
  const html = await renderMarkdownInWorker('Worker 1\nWorker 2\nWorker 3')

  assert.equal(countRenderedBreaks(html), 0)
  assert.equal(countRenderedParagraphs(html), 1)
  assert.match(html, /<p>Worker 1\s*Worker 2\s*Worker 3<\/p>/)
})

test('renderMarkdownInWorker uses blank lines to separate paragraphs and ignores extra empty lines', async () => {
  const html = await renderMarkdownInWorker('Worker 1\n\n\nWorker 2\n')

  assert.equal(countRenderedBreaks(html), 0)
  assert.equal(countRenderedParagraphs(html), 2)
  assert.match(html, /<p>Worker 1<\/p>\s*<p>Worker 2<\/p>/)
})

test('renderMarkdownInWorker supports sanitized raw html when needed', async () => {
  const html = await renderMarkdownInWorker('Hello <span>worker</span><script>bad()</script>')

  assert.match(html, /<span>worker<\/span>/)
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /bad\(\)/)
})

test('renderMarkdownInWorker keeps single newlines soft when raw html is present', async () => {
  const html = await renderMarkdownInWorker('Worker 1\n<span>Inline</span>\nWorker 3')

  assert.equal(countRenderedBreaks(html), 0)
  assert.equal(countRenderedParagraphs(html), 1)
  assert.match(html, /<p>Worker 1\s*<span>Inline<\/span>\s*Worker 3<\/p>/)
})
