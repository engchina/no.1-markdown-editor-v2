const IMG_TAG_PATTERN = /<img\b([^>]*?)(\s*\/?)>/gi
const HTTP_PROTOCOLS = new Set(['http:', 'https:'])
const PREVIEW_EXTERNAL_IMAGE_CLASS = 'preview-external-image'

export interface PreviewExternalImageCopy {
  blockedLabel: string
  clickLabel: string
}

export function isExternalImageSource(source: string, baseOrigin: string): boolean {
  const trimmed = source.trim()
  if (!trimmed) return false

  try {
    const resolvedBaseOrigin = baseOrigin.trim() || 'http://localhost'
    const resolvedSource = new URL(trimmed, resolvedBaseOrigin)
    const resolvedBase = new URL(resolvedBaseOrigin)

    if (!HTTP_PROTOCOLS.has(resolvedSource.protocol)) return false
    return resolvedSource.origin !== resolvedBase.origin
  } catch {
    return false
  }
}

function requiresExternalImageBridge(source: string, baseOrigin: string): boolean {
  const trimmed = source.trim()
  if (!trimmed) return false

  try {
    const resolvedBaseOrigin = baseOrigin.trim() || 'http://localhost'
    const resolvedSource = new URL(trimmed, resolvedBaseOrigin)
    const resolvedBase = new URL(resolvedBaseOrigin)

    if (!HTTP_PROTOCOLS.has(resolvedSource.protocol)) return false
    if (resolvedSource.origin === resolvedBase.origin) return false

    return resolvedSource.protocol === 'http:' && resolvedBase.protocol !== 'http:'
  } catch {
    return false
  }
}

export function rewritePreviewHtmlExternalImages(
  html: string,
  copy: PreviewExternalImageCopy,
  baseOrigin: string
): string {
  if (!html.includes('<img')) return html

  return html.replace(IMG_TAG_PATTERN, (_, rawAttributes: string, selfClosingSlash: string) => {
    const source = getHtmlAttribute(rawAttributes, 'src')
    let nextAttributes = ensureSharedImageAttributes(rawAttributes)

    if (!source || !requiresExternalImageBridge(source, baseOrigin)) {
      return buildImageTag(nextAttributes, selfClosingSlash)
    }

    const host = getExternalImageHost(source)
    const placeholder = buildBlockedExternalImageDataUri(copy, host)

    nextAttributes = removeHtmlAttribute(nextAttributes, 'src')
    nextAttributes = appendClass(nextAttributes, PREVIEW_EXTERNAL_IMAGE_CLASS)
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'src', placeholder)
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'data-external-src', source)
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'data-external-host', host)
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'data-external-image', 'blocked')
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'data-external-placeholder', placeholder)
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'tabindex', '0')
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'role', 'button')
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'aria-label', `${copy.clickLabel}: ${host}`)
    nextAttributes = upsertHtmlAttribute(nextAttributes, 'referrerpolicy', 'no-referrer')

    return buildImageTag(nextAttributes, selfClosingSlash)
  })
}

function buildImageTag(attributes: string, selfClosingSlash: string): string {
  const normalizedAttributes = attributes.replace(/\s+/g, ' ').trim()
  return normalizedAttributes
    ? `<img ${normalizedAttributes}${selfClosingSlash}>`
    : `<img${selfClosingSlash}>`
}

function ensureSharedImageAttributes(attributes: string): string {
  let nextAttributes = upsertHtmlAttribute(attributes, 'loading', 'lazy')
  nextAttributes = upsertHtmlAttribute(nextAttributes, 'decoding', 'async')
  return nextAttributes
}

function getHtmlAttribute(attributes: string, name: string): string {
  const match = attributes.match(new RegExp(`(?:^|\\s+)${escapeForRegExp(name)}="([^"]*)"`, 'i'))
  return decodeHtmlAttribute(match?.[1] ?? '')
}

function removeHtmlAttribute(attributes: string, name: string): string {
  return attributes.replace(new RegExp(`(^|\\s+)${escapeForRegExp(name)}="[^"]*"`, 'gi'), '$1')
}

function upsertHtmlAttribute(attributes: string, name: string, value: string): string {
  const escapedValue = escapeHtmlAttribute(value)
  const pattern = new RegExp(`(^|\\s+)${escapeForRegExp(name)}="[^"]*"`, 'i')
  if (pattern.test(attributes)) {
    return attributes.replace(pattern, `$1${name}="${escapedValue}"`)
  }

  return `${attributes} ${name}="${escapedValue}"`
}

function appendClass(attributes: string, className: string): string {
  const existingClassName = getHtmlAttribute(attributes, 'class')
  const nextClassName = Array.from(new Set([...existingClassName.split(/\s+/).filter(Boolean), className])).join(' ')
  return upsertHtmlAttribute(attributes, 'class', nextClassName)
}

function getExternalImageHost(source: string): string {
  try {
    const hostname = new URL(source).hostname.replace(/^www\./i, '')
    return hostname || 'external source'
  } catch {
    return 'external source'
  }
}

function buildBlockedExternalImageDataUri(copy: PreviewExternalImageCopy, host: string): string {
  const svg = `\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" role="img" aria-label="${escapeXml(copy.blockedLabel)}">\
<defs>\
<linearGradient id="previewExternalImageGradient" x1="0" y1="0" x2="1" y2="1">\
<stop offset="0%" stop-color="#f8fafc" />\
<stop offset="100%" stop-color="#e2e8f0" />\
</linearGradient>\
</defs>\
<rect width="960" height="420" rx="28" fill="url(#previewExternalImageGradient)" />\
<rect x="42" y="42" width="876" height="336" rx="22" fill="#ffffff" fill-opacity="0.72" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="10 10" />\
<circle cx="128" cy="132" r="34" fill="#0f172a" fill-opacity="0.08" />\
<path d="M104 208l58-62 54 52 70-80 114 122H104z" fill="#0f172a" fill-opacity="0.12" />\
<text x="480" y="170" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-size="30" font-weight="700" fill="#0f172a">${escapeXml(copy.blockedLabel)}</text>\
<text x="480" y="220" text-anchor="middle" font-family="JetBrains Mono, Consolas, monospace" font-size="20" fill="#334155">${escapeXml(host)}</text>\
<text x="480" y="280" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-size="22" fill="#475569">${escapeXml(copy.clickLabel)}</text>\
</svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
