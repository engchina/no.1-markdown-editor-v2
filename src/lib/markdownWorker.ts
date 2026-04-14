import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { finalizeRenderedMarkdownHtml, sanitizeSchema, stripFrontMatter } from './markdownShared.ts'
import { containsLikelyRawHtml } from './markdownHtml.ts'
import { rehypeHeadingIds } from './rehypeHeadingIds.ts'
import { rehypeHighlightMarkers } from './rehypeHighlightMarkers.ts'
import { rehypeNormalizeImageSources } from './rehypeNormalizeImageSources.ts'
import { rehypeSuperscriptMarkers } from './rehypeSuperscriptMarkers.ts'
import { remarkSoftBreaks } from './remarkSoftBreaks.ts'

import rehypeHighlight from 'rehype-highlight'
import rehypeShiki from '@shikijs/rehype'

const processors: Record<string, ReturnType<typeof unified>> = {}

function getProcessor(engine: 'highlightjs' | 'shiki') {
  if (processors[engine]) return processors[engine]

  let processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSoftBreaks)
    .use(remarkRehype)
    .use(rehypeSuperscriptMarkers)
    .use(rehypeHighlightMarkers)
    .use(rehypeNormalizeImageSources)
    .use(rehypeSanitize, sanitizeSchema)

  if (engine === 'shiki') {
    processor = processor.use(rehypeShiki, { themes: { light: 'github-light', dark: 'github-dark' } })
  } else {
    processor = processor.use(rehypeHighlight, { ignoreMissing: true })
  }

  processor = processor
    .use(rehypeHeadingIds)
    .use(rehypeStringify)

  processors[engine] = processor
  return processor
}

export async function renderMarkdownInWorker(markdown: string, syntaxHighlightEngine: 'highlightjs' | 'shiki' = 'highlightjs'): Promise<string> {
  const frontMatter = stripFrontMatter(markdown)
  if (containsLikelyRawHtml(frontMatter.body)) {
    const { renderMarkdownWithHtmlInWorker } = await import('./markdownWorkerHtmlRender.ts')
    return renderMarkdownWithHtmlInWorker(markdown, syntaxHighlightEngine)
  }

  const processor = getProcessor(syntaxHighlightEngine)
  const rendered = await processor.process({
    value: frontMatter.body,
    data: { markdownSource: frontMatter.body },
  })
  return finalizeRenderedMarkdownHtml(frontMatter.meta, String(rendered))
}
