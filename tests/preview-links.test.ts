import assert from 'node:assert/strict'
import test from 'node:test'
import { getPreviewExternalLink } from '../src/lib/previewLinks.ts'

const previewUrl = 'http://127.0.0.1:1420/'

test('getPreviewExternalLink resolves http and https urls', () => {
  assert.deepEqual(getPreviewExternalLink('https://example.com/docs', previewUrl), {
    href: 'https://example.com/docs',
    label: 'example.com',
  })

  assert.deepEqual(getPreviewExternalLink('http://example.com:8080/image.png', previewUrl), {
    href: 'http://example.com:8080/image.png',
    label: 'example.com:8080',
  })
})

test('getPreviewExternalLink resolves mailto and tel targets', () => {
  assert.deepEqual(getPreviewExternalLink('mailto:support@example.com', previewUrl), {
    href: 'mailto:support@example.com',
    label: 'support@example.com',
  })

  assert.deepEqual(getPreviewExternalLink('tel:+81-90-1234-5678', previewUrl), {
    href: 'tel:+81-90-1234-5678',
    label: '+81-90-1234-5678',
  })
})

test('getPreviewExternalLink ignores in-document anchors and local paths', () => {
  assert.equal(getPreviewExternalLink('#overview', previewUrl), null)
  assert.equal(getPreviewExternalLink('./guide.md', previewUrl), null)
  assert.equal(getPreviewExternalLink('/images/hero.png', previewUrl), null)
  assert.equal(getPreviewExternalLink('javascript:alert(1)', previewUrl), null)
})
