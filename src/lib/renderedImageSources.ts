import { resolveTyporaRootUrlAsset } from './imageRoots.ts'

const IMG_TAG_PATTERN = /<img\b([^>]*?)(\s*\/?)>/gi

interface RewriteRenderedHtmlImageSourcesOptions {
  frontMatter?: Record<string, string> | null
}

export function rewriteRenderedHtmlImageSources(
  html: string,
  options: RewriteRenderedHtmlImageSourcesOptions = {}
): string {
  if (!html.includes('<img')) return html

  const rootUrl = getFrontMatterValue(options.frontMatter, 'typora-root-url')
  if (!rootUrl) return html

  return html.replace(IMG_TAG_PATTERN, (_, rawAttributes: string, selfClosingSlash: string) => {
    const source = getHtmlAttribute(rawAttributes, 'src')
    if (!source) {
      return buildImageTag(rawAttributes, selfClosingSlash)
    }

    const resolvedSource = resolveTyporaRootUrlAsset(source, rootUrl)
    if (!resolvedSource || resolvedSource === source) {
      return buildImageTag(rawAttributes, selfClosingSlash)
    }

    return buildImageTag(upsertHtmlAttribute(rawAttributes, 'src', resolvedSource), selfClosingSlash)
  })
}

function getFrontMatterValue(frontMatter: Record<string, string> | null | undefined, key: string): string {
  if (!frontMatter) return ''
  const normalizedKey = key.trim().toLowerCase()
  for (const [entryKey, entryValue] of Object.entries(frontMatter)) {
    if (entryKey.trim().toLowerCase() === normalizedKey) {
      return entryValue
    }
  }
  return ''
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
