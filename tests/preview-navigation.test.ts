import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getPreviewInternalAnchorId, resolvePreviewNavigationScrollTop } from '../src/lib/previewNavigation.ts'

const previewUrl = 'http://127.0.0.1:1420/'

test('getPreviewInternalAnchorId resolves same-document hashes and decodes anchor ids', () => {
  assert.equal(getPreviewInternalAnchorId('#overview', previewUrl), 'overview')
  assert.equal(
    getPreviewInternalAnchorId('http://127.0.0.1:1420/#Block%20Elements', previewUrl),
    'Block Elements'
  )
  assert.equal(
    getPreviewInternalAnchorId('/index.html#footnotes', 'http://127.0.0.1:1420/index.html'),
    'footnotes'
  )
})

test('getPreviewInternalAnchorId ignores empty hashes, external urls, and other documents', () => {
  assert.equal(getPreviewInternalAnchorId('#', previewUrl), null)
  assert.equal(getPreviewInternalAnchorId('./guide.md#overview', previewUrl), null)
  assert.equal(getPreviewInternalAnchorId('https://example.com/#overview', previewUrl), null)
  assert.equal(getPreviewInternalAnchorId('mailto:support@example.com', previewUrl), null)
})

test('resolvePreviewNavigationScrollTop clamps preview jumps inside the scrollable range', () => {
  assert.equal(
    resolvePreviewNavigationScrollTop({
      previewTop: 120,
      previewHeight: 480,
      previewScrollHeight: 1600,
      previewScrollTop: 320,
      targetTop: 560,
    }),
    744
  )

  assert.equal(
    resolvePreviewNavigationScrollTop({
      previewTop: 80,
      previewHeight: 420,
      previewScrollHeight: 900,
      previewScrollTop: 180,
      targetTop: 760,
      topOffset: 24,
    }),
    480
  )

  assert.equal(
    resolvePreviewNavigationScrollTop({
      previewTop: 200,
      previewHeight: 500,
      previewScrollHeight: 900,
      previewScrollTop: 40,
      targetTop: 140,
    }),
    0
  )
})

test('MarkdownPreview intercepts same-document anchors and scrolls the preview shell directly', async () => {
  const source = await readFile(new URL('../src/components/Preview/MarkdownPreview.tsx', import.meta.url), 'utf8')

  assert.match(source, /const navigateInternalPreviewAnchor = useCallback\(/)
  assert.match(source, /getPreviewInternalAnchorId\(anchor\.getAttribute\('href'\), previewLocationHref\)/)
  assert.match(source, /scrollPreviewToTarget\(preview, target\)/)
  assert.match(source, /if \(navigateInternalPreviewAnchor\(anchor\)\) \{[\s\S]*?event\.preventDefault\(\)/u)
})

test('OutlinePanel reuses the shared preview navigation helper for heading jumps', async () => {
  const source = await readFile(new URL('../src/components/Sidebar/OutlinePanel.tsx', import.meta.url), 'utf8')

  assert.match(source, /resolvePreviewAnchorTarget\(previewElement, heading\.id\)/)
  assert.match(source, /scrollPreviewToTarget\(previewElement, element\)/)
  assert.match(source, /flashPreviewTarget\(element\)/)
})
