import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import {
  buildStandaloneHtml,
  containsLikelyMath,
  finalizeRenderedMarkdownHtml,
  sanitizeSchema,
  stripFrontMatter,
} from './markdownShared.ts'
import { containsLikelyRawHtml } from './markdownHtml.ts'
import { rehypeHeadingIds } from './rehypeHeadingIds.ts'
import { rehypeHighlightMarkers } from './rehypeHighlightMarkers.ts'
import { rehypeNormalizeImageSources } from './rehypeNormalizeImageSources.ts'
import { rehypeSuperscriptMarkers } from './rehypeSuperscriptMarkers.ts'
import { remarkSoftBreaks } from './remarkSoftBreaks.ts'

import rehypeHighlight from 'rehype-highlight'
import rehypeShiki from '@shikijs/rehype'

const processors: Record<string, ReturnType<typeof unified>> = {}

function getProcessorWithoutMath(engine: 'highlightjs' | 'shiki') {
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

let mathRendererPromise: Promise<typeof import('./markdownMathRender.ts')> | null = null
let htmlRendererPromise: Promise<typeof import('./markdownHtmlRender.ts')> | null = null
let mathHtmlRendererPromise: Promise<typeof import('./markdownMathHtmlRender.ts')> | null = null

async function renderBaseMarkdown(markdown: string, syntaxHighlightEngine: 'highlightjs' | 'shiki' = 'highlightjs'): Promise<string> {
  const { meta, body } = stripFrontMatter(markdown)
  const processor = getProcessorWithoutMath(syntaxHighlightEngine)
  const rendered = await processor.process({
    value: body,
    data: { markdownSource: body },
  })
  return finalizeRenderedMarkdownHtml(meta, String(rendered))
}

export { buildStandaloneHtml, containsLikelyMath, stripFrontMatter }

export async function renderMarkdown(markdown: string, syntaxHighlightEngine: 'highlightjs' | 'shiki' = 'highlightjs'): Promise<string> {
  const { body } = stripFrontMatter(markdown)
  const hasMath = containsLikelyMath(body)
  const hasRawHtml = containsLikelyRawHtml(body)

  if (!hasMath && !hasRawHtml) {
    return renderBaseMarkdown(markdown, syntaxHighlightEngine)
  }

  if (!hasMath) {
    htmlRendererPromise ??= import('./markdownHtmlRender.ts')
    const { renderMarkdownWithHtml } = await htmlRendererPromise
    return renderMarkdownWithHtml(markdown, syntaxHighlightEngine)
  }

  if (!hasRawHtml) {
    mathRendererPromise ??= import('./markdownMathRender.ts')
    const { renderMarkdownWithMath } = await mathRendererPromise
    return renderMarkdownWithMath(markdown, syntaxHighlightEngine)
  }

  mathHtmlRendererPromise ??= import('./markdownMathHtmlRender.ts')
  const { renderMarkdownWithMathAndHtml } = await mathHtmlRendererPromise
  return renderMarkdownWithMathAndHtml(markdown, syntaxHighlightEngine)
}
