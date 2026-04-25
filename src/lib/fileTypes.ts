export const MARKDOWN_FILE_EXTENSIONS = ['md', 'markdown', 'mdx', 'txt'] as const
export const DEFAULT_MARKDOWN_IMAGE_DIRECTORY = 'images'

const MARKDOWN_FILE_PATTERN = /\.(?:md|markdown|mdx|txt)$/i
const KNOWN_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])
const KNOWN_ATTACHMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'ppt',
  'pptx',
  'zip',
  '7z',
  'tar',
  'gz',
  'tgz',
  'epub',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'mp4',
  'mov',
  'webm',
  'avi',
  'mkv',
])
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
  const extension = getFileNameExtension(fileName)
  if (extension && KNOWN_IMAGE_EXTENSIONS.has(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension
  }

  return getImageExtensionForMimeType(mimeType)
}

export function isLikelyImageFileName(fileName: string): boolean {
  const extension = getFileNameExtension(fileName)
  return extension ? KNOWN_IMAGE_EXTENSIONS.has(extension) : false
}

export function isLikelyAttachmentFileName(fileName: string): boolean {
  const extension = getFileNameExtension(fileName)
  return extension ? KNOWN_ATTACHMENT_EXTENSIONS.has(extension) : false
}

export function isLikelyWorkspaceAssetFileName(fileName: string): boolean {
  return isLikelyImageFileName(fileName) || isLikelyAttachmentFileName(fileName)
}

export function getImageAltText(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, '')
  const normalized = withoutExtension.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized.replace(/[\[\]]/g, '') || 'image'
}

export function getImageExtensionForMimeType(mimeType = ''): string {
  return MIME_IMAGE_EXTENSIONS[mimeType.toLowerCase()] ?? 'png'
}

export function buildRelativeMarkdownImagePath(
  fileName: string,
  directory = DEFAULT_MARKDOWN_IMAGE_DIRECTORY
): string {
  const normalizedDirectory = directory.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '').trim()
  return normalizedDirectory ? `./${normalizedDirectory}/${fileName}` : `./${fileName}`
}

function getFileNameExtension(fileName: string): string | null {
  const nameMatch = fileName.match(/\.([a-z0-9]+)$/i)
  return nameMatch?.[1]?.toLowerCase() ?? null
}
