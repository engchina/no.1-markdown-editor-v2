import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const katexRoot = path.join(projectRoot, 'node_modules', 'katex', 'dist')
const outputDir = path.join(projectRoot, 'src', 'generated')
const outputFile = path.join(outputDir, 'katexInlineCss.generated.ts')

const FONT_MIME_TYPES = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}

async function fileToDataUrl(fontPath) {
  const extension = path.extname(fontPath).toLowerCase()
  const mimeType = FONT_MIME_TYPES[extension]
  if (!mimeType) {
    throw new Error(`Unsupported KaTeX font type: ${extension}`)
  }

  const fontBuffer = await readFile(fontPath)
  return `data:${mimeType};base64,${fontBuffer.toString('base64')}`
}

async function inlineKatexCss() {
  const cssPath = path.join(katexRoot, 'katex.min.css')
  let css = await readFile(cssPath, 'utf8')
  const fontsDir = path.join(katexRoot, 'fonts')
  const fontCache = new Map()

  css = css.replace(
    /src:url\((['"]?)(?:fonts\/)?([^'")]+\.woff2)\1\) format\("woff2"\),url\((['"]?)(?:fonts\/)?([^'")]+\.woff)\3\) format\("woff"\),url\((['"]?)(?:fonts\/)?([^'")]+\.ttf)\5\) format\("truetype"\)/g,
    'src:url(fonts/$2) format("woff2")'
  )

  let result = css
  const matches = [...css.matchAll(/url\((['"]?)(?:fonts\/)?([^'")]+)\1\)/g)]

  for (const match of matches) {
    const assetName = match[2]
    let dataUrl = fontCache.get(assetName)
    if (!dataUrl) {
      dataUrl = await fileToDataUrl(path.join(fontsDir, assetName))
      fontCache.set(assetName, dataUrl)
    }
    result = result.replace(match[0], `url(${dataUrl})`)
  }

  return result
}

async function main() {
  const inlineCss = await inlineKatexCss()
  await mkdir(outputDir, { recursive: true })
  const output = `const inlineKatexCss = ${JSON.stringify(inlineCss)} as const;\nexport default inlineKatexCss;\n`
  await writeFile(outputFile, output, 'utf8')
}

await main()
