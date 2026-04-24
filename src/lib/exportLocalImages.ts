import { loadLocalPreviewImage } from './previewLocalImage.ts'
import { buildLocalPreviewImageKey, isLocalPreviewImageSource } from './previewLocalImages.ts'

const IMG_TAG_PATTERN = /<img\b([^>]*?)(\s*\/?)>/gi

type LocalImageResolver = (source: string, documentPath: string | null) => Promise<string | null>

interface InlineLocalImagesForExportOptions {
  documentPath?: string | null
  resolveLocalImage?: LocalImageResolver
}

export async function inlineLocalImagesForExport(
  html: string,
  options: InlineLocalImagesForExportOptions = {}
): Promise<string> {
  if (!html.includes('<img')) return html

  const documentPath = options.documentPath?.trim() ?? ''
  const resolveLocalImage = options.resolveLocalImage ?? loadLocalPreviewImage
  const localImages = new Map<string, string>()

  html.replace(IMG_TAG_PATTERN, (_, rawAttributes: string) => {
    const source = getHtmlAttribute(rawAttributes, 'src')
    if (!isLocalPreviewImageSource(source, documentPath)) {
      return ''
    }

    const key = buildLocalPreviewImageKey(source, documentPath)
    if (!localImages.has(key)) {
      localImages.set(key, source)
    }
    return ''
  })

  if (localImages.size === 0) return html

  const resolvedImages = new Map<string, string>()
  await Promise.all(
    Array.from(localImages.entries()).map(async ([key, source]) => {
      const resolvedSource = await resolveLocalImage(source, documentPath || null)
      if (resolvedSource && resolvedSource !== source) {
        resolvedImages.set(key, resolvedSource)
      }
    })
  )

  if (resolvedImages.size === 0) return html

  return html.replace(IMG_TAG_PATTERN, (_, rawAttributes: string, selfClosingSlash: string) => {
    const source = getHtmlAttribute(rawAttributes, 'src')
    const key = buildLocalPreviewImageKey(source, documentPath)
    const resolvedSource = resolvedImages.get(key)
    if (!resolvedSource) {
      return buildImageTag(rawAttributes, selfClosingSlash)
    }

    return buildImageTag(upsertHtmlAttribute(rawAttributes, 'src', resolvedSource), selfClosingSlash)
  })
}

function buildImageTag(attributes: string, selfClosingSlash: string): string {
  const normalizedAttributes = attributes.replace(/\s+/g, ' ').trim()
  return normalizedAttributes
    ? `<img ${normalizedAttributes}${selfClosingSlash}>`
    : `<img${selfClosingSlash}>`
}

function getHtmlAttribute(attributes: string, name: string): string {
  const match = attributes.match(new RegExp(`(?:^|\\s+)${escapeForRegExp(name)}="([^"]*)"`, 'i'))
  return decodeHtmlAttribute(match?.[1] ?? '')
}

function upsertHtmlAttribute(attributes: string, name: string, value: string): string {
  const escapedValue = escapeHtmlAttribute(value)
  const pattern = new RegExp(`(^|\\s+)${escapeForRegExp(name)}="[^"]*"`, 'i')
  if (pattern.test(attributes)) {
    return attributes.replace(pattern, `$1${name}="${escapedValue}"`)
  }

  return `${attributes} ${name}="${escapedValue}"`
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
