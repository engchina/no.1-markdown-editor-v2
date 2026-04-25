import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('useMarkdown sends preview rendering through the worker whenever the worker is available', async () => {
  const source = await readFile(new URL('../src/hooks/useMarkdown.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /containsLikelyMath/u)
  assert.doesNotMatch(source, /stripFrontMatterBody/u)
  assert.match(source, /if \(workerRef\.current && !workerUnavailableRef\.current\) \{/u)
  assert.match(source, /workerRef\.current\.postMessage\(\{ id: requestId, markdown, syntaxHighlightEngine \}\)/u)
})

test('markdownWorker routes math and html combinations to the dedicated renderers before falling back to the plain processor', async () => {
  const source = await readFile(new URL('../src/lib/markdownWorker.ts', import.meta.url), 'utf8')

  assert.match(source, /import \{ containsLikelyMath \} from '\.\/markdownMath\.ts'/u)
  assert.match(source, /const hasMath = containsLikelyMath\(frontMatter\.body\)/u)
  assert.match(source, /const hasRawHtml = containsLikelyRawHtml\(frontMatter\.body\)/u)
  assert.match(source, /if \(hasMath && hasRawHtml\) \{[\s\S]*import\('\.\/markdownMathHtmlRender\.ts'\)/u)
  assert.match(source, /if \(hasMath\) \{[\s\S]*import\('\.\/markdownMathRender\.ts'\)/u)
  assert.match(source, /if \(hasRawHtml\) \{[\s\S]*import\('\.\/markdownWorkerHtmlRender\.ts'\)/u)
})

test('markdown worker entry lazy-loads the markdown rendering core on first request', async () => {
  const source = await readFile(new URL('../src/workers/markdown.worker.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /import \{ renderMarkdownInWorker \} from '\.\.\/lib\/markdownWorker'/u)
  assert.match(source, /let markdownRendererPromise: Promise<typeof import\('\.\.\/lib\/markdownWorker'\)> \| null = null/u)
  assert.match(source, /markdownRendererPromise \?\?= import\('\.\.\/lib\/markdownWorker'\)\.catch\(/u)
  assert.match(source, /const \{ renderMarkdownInWorker \} = await loadMarkdownRenderer\(\)/u)
})
