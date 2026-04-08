const IMG_TAG_PATTERN = /<img\b([^>]*?)(\s*\/?)>/gi
const LOCAL_PREVIEW_PLACEHOLDER =
  'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2218%22 viewBox=%220 0 24 18%22%3E%3Crect width=%2224%22 height=%2218%22 rx=%223%22 fill=%22%23e5e7eb%22/%3E%3C/svg%3E'

interface RewritePreviewHtmlLocalImagesOptions {
  documentPath?: string | null
  resolvedImages?: Record<string, string>
}

export function rewritePreviewHtmlLocalImages(
  html: string,
  options: RewritePreviewHtmlLocalImagesOptions = {}
): string {
  if (!html.includes('<img')) return html

  const documentPath = options.documentPath?.trim() ?? ''
  return html.replace(IMG_TAG_PATTERN, (_, rawAttributes: string, selfClosingSlash: string) => {
    const source = getHtmlAttribute(rawAttributes, 'src')
    if (!isLocalPreviewImageSource(source, documentPath)) {
      return buildImageTag(rawAttributes, selfClosingSlash)
    }

    const resolvedSource = options.resolvedImages?.[buildLocalPreviewImageKey(source, documentPath)]
    if (resolvedSource) {
      let nextAttributes = rawAttributes
      nextAttributes = upsertHtmlAttribute(nextAttributes, 'src', resolvedSource)
      nextAttributes = removeHtmlAttribute(nextAttributes, 'data-local-src')
      nextAttributes = removeHtmlAttribute(nextAttributes, 'data-local-image')
      nextAttributes = removeHtmlAttribute(nextAttributes, 'data-local-placeholder')
      return buildImageTag(nextAttributes, selfClosingSlash)
    }

    let nextAttributes = rawAttributes
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'src', LOCAL_PREVIEW_PLACEHOLDER)
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'data-local-src', source)
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'data-local-image', 'pending')
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'data-local-placeholder', LOCAL_PREVIEW_PLACEHOLDER)
    return buildImageTag(nextAttributes, selfClosingSlash)
  })
}

export function isLocalPreviewImageSource(source: string, documentPath: string | null | undefined): boolean {
  const trimmed = source.trim()
  if (!trimmed) return false
  if (/^(https?:|data:|blob:|asset:)/i.test(trimmed)) return false
  if (/^https?:\/\/asset\.localhost\//i.test(trimmed)) return false
  if (trimmed.startsWith('//')) return false
  if (/^file:/i.test(trimmed)) return true
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) return true
  if (trimmed.startsWith('/')) return true
  return Boolean(documentPath?.trim())
}

export function buildLocalPreviewImageKey(source: string, documentPath: string | null | undefined): string {
  return `${documentPath?.trim() ?? ''}\n${source.trim()}`
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

function removeHtmlAttribute(attributes: string, name: string): string {
  return attributes.replace(new RegExp(`(^|\\s+)${escapeForRegExp(name)}="[^"]*"`, 'gi'), '$1')
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
