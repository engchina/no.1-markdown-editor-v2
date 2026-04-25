import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { finalizeRenderedMarkdownHtml, sanitizeSchema, stripFrontMatter } from './markdownShared.ts'
import { containsLikelyRawHtml } from './markdownHtml.ts'
import { containsLikelyMath } from './markdownMath.ts'
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
let mathRendererPromise: Promise<typeof import('./markdownMathRender.ts')> | null = null
let htmlRendererPromise: Promise<typeof import('./markdownWorkerHtmlRender.ts')> | null = null
let mathHtmlRendererPromise: Promise<typeof import('./markdownMathHtmlRender.ts')> | null = null

async function getProcessor(engine: MarkdownSyntaxHighlightEngine) {
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

export async function renderMarkdownInWorker(
  markdown: string,
  syntaxHighlightEngine: MarkdownSyntaxHighlightEngine = 'highlightjs'
): Promise<string> {
  const frontMatter = stripFrontMatter(markdown)
  const hasMath = containsLikelyMath(frontMatter.body)
  const hasRawHtml = containsLikelyRawHtml(frontMatter.body)

  if (hasMath && hasRawHtml) {
    mathHtmlRendererPromise ??= import('./markdownMathHtmlRender.ts')
    const { renderMarkdownWithMathAndHtml } = await mathHtmlRendererPromise
    return renderMarkdownWithMathAndHtml(markdown, syntaxHighlightEngine)
  }

  if (hasMath) {
    mathRendererPromise ??= import('./markdownMathRender.ts')
    const { renderMarkdownWithMath } = await mathRendererPromise
    return renderMarkdownWithMath(markdown, syntaxHighlightEngine)
  }

  if (hasRawHtml) {
    htmlRendererPromise ??= import('./markdownWorkerHtmlRender.ts')
    const { renderMarkdownWithHtmlInWorker } = await htmlRendererPromise
    return renderMarkdownWithHtmlInWorker(markdown, syntaxHighlightEngine)
  }

  const processor = await getProcessor(syntaxHighlightEngine)
  const rendered = await processor.process({
    value: frontMatter.body,
    data: { markdownSource: frontMatter.body },
  })
  return finalizeRenderedMarkdownHtml(frontMatter.meta, String(rendered))
}
