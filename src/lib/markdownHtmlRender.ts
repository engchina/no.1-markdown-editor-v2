import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { finalizeRenderedMarkdownHtml, sanitizeSchema, stripFrontMatter } from './markdownShared.ts'
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

async function getProcessorWithHtml(engine: MarkdownSyntaxHighlightEngine) {
  if (processors[engine]) return processors[engine]

  processors[engine] = (async () => {
    let processor: any = unified()
      .use(remarkParse)
      .use(remarkGfm, { singleTilde: false })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
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

export async function renderMarkdownWithHtml(
  markdown: string,
  syntaxHighlightEngine: MarkdownSyntaxHighlightEngine = 'highlightjs'
): Promise<string> {
  const { meta, body } = stripFrontMatter(markdown)
  const processor = await getProcessorWithHtml(syntaxHighlightEngine)
  const rendered = await processor.process({
    value: body,
    data: { markdownSource: body },
  })
  return finalizeRenderedMarkdownHtml(meta, String(rendered))
}
