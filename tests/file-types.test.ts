import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRelativeMarkdownImagePath,
  getImageAltText,
  getImageFileExtension,
  isLikelyAttachmentFileName,
  isLikelyWorkspaceAssetFileName,
  isSupportedDocumentName,
} from '../src/lib/fileTypes.ts'

test('isSupportedDocumentName recognizes supported markdown-like documents', () => {
  assert.equal(isSupportedDocumentName('notes.md'), true)
  assert.equal(isSupportedDocumentName('README.MDX'), true)
  assert.equal(isSupportedDocumentName('draft.markdown'), true)
  assert.equal(isSupportedDocumentName('todo.txt'), true)
  assert.equal(isSupportedDocumentName('photo.png'), false)
})

test('getImageFileExtension prefers filename extension and falls back to mime type', () => {
  assert.equal(getImageFileExtension('diagram.jpeg', 'image/png'), 'jpg')
  assert.equal(getImageFileExtension('diagram', 'image/webp'), 'webp')
  assert.equal(getImageFileExtension('diagram.unknown', 'image/avif'), 'avif')
  assert.equal(getImageFileExtension('diagram', ''), 'png')
})

test('getImageAltText normalizes separators and strips brackets', () => {
  assert.equal(getImageAltText('hero-image_v2.png'), 'hero image v2')
  assert.equal(getImageAltText('[cover]_draft.JPG'), 'cover draft')
  assert.equal(getImageAltText('.png'), 'image')
})

test('attachment and workspace asset helpers recognize supported non-image asset types', () => {
  assert.equal(isLikelyAttachmentFileName('manual.pdf'), true)
  assert.equal(isLikelyAttachmentFileName('bundle.zip'), true)
  assert.equal(isLikelyAttachmentFileName('hero.png'), false)
  assert.equal(isLikelyAttachmentFileName('notes.md'), false)

  assert.equal(isLikelyWorkspaceAssetFileName('manual.pdf'), true)
  assert.equal(isLikelyWorkspaceAssetFileName('hero.png'), true)
  assert.equal(isLikelyWorkspaceAssetFileName('notes.md'), false)
})

test('buildRelativeMarkdownImagePath defaults to the sibling images directory', () => {
  assert.equal(buildRelativeMarkdownImagePath('image-123.png'), './images/image-123.png')
  assert.equal(buildRelativeMarkdownImagePath('hero.webp', './images/'), './images/hero.webp')
  assert.equal(buildRelativeMarkdownImagePath('cover.jpg', 'nested\\images'), './nested/images/cover.jpg')
})
