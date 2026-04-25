import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('wysiwyg inline markdown keeps lightweight raw-html fallback handling without rehype-raw', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwygInlineMarkdown.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /import rehypeRaw from 'rehype-raw'/u)
  assert.match(source, /import \{ buildReferenceAwareMarkdownSource \} from '\.\/wysiwygReferenceLinks\.ts'/u)
  assert.match(source, /\.use\(remarkRehype, \{ allowDangerousHtml: true \}\)/u)
  assert.match(source, /\.use\(rehypeInlineRawHtmlFallback\)/u)
  assert.match(source, /referenceDefinitionsMarkdown\?: string/u)
  assert.match(source, /buildReferenceAwareMarkdownSource\(source, referenceDefinitionsMarkdown\)/u)
  assert.match(source, /INLINE_HTML_BREAK_SEQUENCE_PATTERN/u)
  assert.match(source, /DANGEROUS_INLINE_HTML_PATTERN/u)
  assert.match(source, /return Array\.from\(value\.matchAll\(INLINE_HTML_BREAK_PATTERN\)/u)
})
