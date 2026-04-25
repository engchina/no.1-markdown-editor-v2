import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('preview loads the KaTeX stylesheet lazily and resolves its asset url without routing through the markdown math chunk', async () => {
  const [previewSource, katexStylesheetSource] = await Promise.all([
    readFile(new URL('../src/components/Preview/MarkdownPreview.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/katexStylesheet.ts', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(
    previewSource,
    /import\s*\{\s*ensureKatexStylesheet\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/katexStylesheet['"]/u
  )
  assert.match(previewSource, /if \(!previewHtml\.includes\('class="katex"'\)\) return/u)
  assert.match(previewSource, /import\('\.\.\/\.\.\/lib\/katexStylesheet'\)/u)
  assert.match(previewSource, /\.then\(\(\{ ensureKatexStylesheet \}\) => ensureKatexStylesheet\(\)\)/u)

  assert.match(
    katexStylesheetSource,
    /new URL\('\.\.\/\.\.\/node_modules\/katex\/dist\/katex\.min\.css', import\.meta\.url\)\.href/u
  )
  assert.doesNotMatch(katexStylesheetSource, /katex\/dist\/katex\.min\.css\?url/u)
})
