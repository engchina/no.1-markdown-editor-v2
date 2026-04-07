const MULTI_FORMAT_FONT_PATTERN =
  /src:url\((['"]?)([^'")]+\.woff2(?:\?[^'")]+)?)\1\)\s*format\("woff2"\),url\((['"]?)([^'")]+\.woff(?:\?[^'")]+)?)\3\)\s*format\("woff"\),url\((['"]?)([^'")]+\.ttf(?:\?[^'")]+)?)\5\)\s*format\("truetype"\)/g
const CSS_URL_PATTERN = /url\((['"]?)([^'")]+)\1\)/g
const FONT_MIME_TYPES = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
} as const

const isBrowserEnvironment = typeof window !== 'undefined' && typeof document !== 'undefined'

let inlineKatexCssPromise: Promise<string> | null = null

function preferWoff2Fonts(css: string): string {
  return css.replace(MULTI_FORMAT_FONT_PATTERN, 'src:url($1$2$1) format("woff2")')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getAssetMimeType(assetUrl: URL, contentType?: string | null): string {
  if (contentType) {
    return contentType.split(';', 1)[0]
  }

  for (const [extension, mimeType] of Object.entries(FONT_MIME_TYPES)) {
    if (assetUrl.pathname.endsWith(extension)) {
      return mimeType
    }
  }

  throw new Error(`Unsupported KaTeX font asset: ${assetUrl.pathname}`)
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

async function inlineCssAssetUrls(
  css: string,
  resolveDataUrl: (assetPath: string) => Promise<string>
): Promise<string> {
  const assetPaths = [
    ...new Set(
      [...css.matchAll(CSS_URL_PATTERN)]
        .map((match) => match[2])
        .filter((assetPath) => !assetPath.startsWith('data:'))
    ),
  ]

  let result = css
  for (const assetPath of assetPaths) {
    const dataUrl = await resolveDataUrl(assetPath)
    const assetPattern = new RegExp(`url\\((['"]?)${escapeRegExp(assetPath)}\\1\\)`, 'g')
    result = result.replace(assetPattern, `url(${dataUrl})`)
  }

  return result
}

async function buildInlineKatexCssInBrowser(): Promise<string> {
  const { katexStylesheetUrl } = await import('./katexStylesheet')
  const stylesheetUrl = new URL(katexStylesheetUrl, window.location.href)
  const stylesheetResponse = await fetch(stylesheetUrl)
  if (!stylesheetResponse.ok) {
    throw new Error(`Failed to read KaTeX stylesheet: ${stylesheetResponse.status}`)
  }

  const css = preferWoff2Fonts(await stylesheetResponse.text())
  return inlineCssAssetUrls(css, async (assetPath) => {
    const assetUrl = new URL(assetPath, stylesheetUrl)
    const fontResponse = await fetch(assetUrl)
    if (!fontResponse.ok) {
      throw new Error(`Failed to read KaTeX font: ${fontResponse.status}`)
    }

    const fontBuffer = await fontResponse.arrayBuffer()
    const mimeType = getAssetMimeType(assetUrl, fontResponse.headers.get('content-type'))
    return `data:${mimeType};base64,${arrayBufferToBase64(fontBuffer)}`
  })
}

async function buildInlineKatexCssInNode(): Promise<string> {
  const fsModuleId = 'node:fs/promises'
  const { readFile } = await import(/* @vite-ignore */ fsModuleId)
  const katexStylesheetPath = ['..', '..', 'node_modules', 'katex', 'dist', 'katex.min.css'].join('/')
  const stylesheetUrl = new URL(katexStylesheetPath, import.meta.url)
  const css = preferWoff2Fonts(await readFile(stylesheetUrl, 'utf8'))

  return inlineCssAssetUrls(css, async (assetPath) => {
    const assetUrl = new URL(assetPath, stylesheetUrl)
    const fontBuffer = await readFile(assetUrl)
    const mimeType = getAssetMimeType(assetUrl)
    return `data:${mimeType};base64,${fontBuffer.toString('base64')}`
  })
}

export async function getInlineKatexCss(): Promise<string> {
  if (!inlineKatexCssPromise) {
    inlineKatexCssPromise = isBrowserEnvironment ? buildInlineKatexCssInBrowser() : buildInlineKatexCssInNode()
  }

  return inlineKatexCssPromise
}
