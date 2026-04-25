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
import {
  applyMarkdownSyntaxHighlighting,
  type MarkdownSyntaxHighlightEngine,
} from './markdownSyntaxHighlight.ts'
import { rehypeSubscriptMarkers } from './rehypeSubscriptMarkers.ts'
import { rehypeSuperscriptMarkers } from './rehypeSuperscriptMarkers.ts'

const processors: Partial<Record<MarkdownSyntaxHighlightEngine, Promise<any>>> = {}

async function getProcessorWithoutMath(engine: MarkdownSyntaxHighlightEngine) {
  if (processors[engine]) return processors[engine]

  processors[engine] = (async () => {
    let processor: any = unified()
      .use(remarkParse)
      .use(remarkGfm, { singleTilde: false })
      .use(remarkRehype)
      .use(rehypeSubscriptMarkers)
      .use(rehypeSuperscriptMarkers)
      .use(rehypeHighlightMarkers)
      .use(rehypeNormalizeImageSources)
      .use(rehypeSanitize, sanitizeSchema)

    processor = await applyMarkdownSyntaxHighlighting(processor, engine)

    return processor
      .use(rehypeHeadingIds)
      .use(rehypeStringify)
  })().catch((error) => {
    delete processors[engine]
    throw error
  })

  return processors[engine]
}

let mathRendererPromise: Promise<typeof import('./markdownMathRender.ts')> | null = null
let htmlRendererPromise: Promise<typeof import('./markdownHtmlRender.ts')> | null = null
let mathHtmlRendererPromise: Promise<typeof import('./markdownMathHtmlRender.ts')> | null = null

async function renderBaseMarkdown(
  markdown: string,
  syntaxHighlightEngine: MarkdownSyntaxHighlightEngine = 'highlightjs'
): Promise<string> {
  const { meta, body } = stripFrontMatter(markdown)
  const processor = await getProcessorWithoutMath(syntaxHighlightEngine)
  const rendered = await processor.process({
    value: body,
    data: { markdownSource: body },
  })
  return finalizeRenderedMarkdownHtml(meta, String(rendered))
}

export { buildStandaloneHtml, containsLikelyMath, stripFrontMatter }

export async function renderMarkdown(
  markdown: string,
  syntaxHighlightEngine: MarkdownSyntaxHighlightEngine = 'highlightjs'
): Promise<string> {
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
