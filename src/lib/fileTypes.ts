export const MARKDOWN_FILE_EXTENSIONS = ['md', 'markdown', 'mdx', 'txt'] as const

const MARKDOWN_FILE_PATTERN = /\.(?:md|markdown|mdx|txt)$/i
const KNOWN_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])
const MIME_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
}

export function isSupportedDocumentName(name: string): boolean {
  return MARKDOWN_FILE_PATTERN.test(name)
}

export function getImageFileExtension(fileName: string, mimeType = ''): string {
  const nameMatch = fileName.match(/\.([a-z0-9]+)$/i)
  const extension = nameMatch?.[1]?.toLowerCase()
  if (extension && KNOWN_IMAGE_EXTENSIONS.has(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension
  }

  return MIME_IMAGE_EXTENSIONS[mimeType.toLowerCase()] ?? 'png'
}

export function getImageAltText(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, '')
  const normalized = withoutExtension.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized.replace(/[\[\]]/g, '') || 'image'
}
