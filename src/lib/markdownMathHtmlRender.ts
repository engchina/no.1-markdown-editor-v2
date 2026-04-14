import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import rehypeKatex from 'rehype-katex'
import { finalizeRenderedMarkdownHtml, sanitizeSchema, stripFrontMatter } from './markdownShared.ts'
import { rehypeHeadingIds } from './rehypeHeadingIds.ts'
import { rehypeHighlightMarkers } from './rehypeHighlightMarkers.ts'
import { rehypeNormalizeImageSources } from './rehypeNormalizeImageSources.ts'
import { rehypeSuperscriptMarkers } from './rehypeSuperscriptMarkers.ts'
import { remarkSoftBreaks } from './remarkSoftBreaks.ts'

import rehypeHighlight from 'rehype-highlight'
import rehypeShiki from '@shikijs/rehype'

const processors: Record<string, any> = {}

function getProcessorWithMathAndHtml(engine: 'highlightjs' | 'shiki') {
  if (processors[engine]) return processors[engine]

  let processor: any = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkSoftBreaks)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSuperscriptMarkers)
    .use(rehypeHighlightMarkers)
    .use(rehypeNormalizeImageSources)
    .use(rehypeSanitize, sanitizeSchema)

  if (engine === 'shiki') {
    processor = processor.use(rehypeShiki, { 
      themes: { light: 'github-light', dark: 'github-dark' },
      fallbackLanguage: 'txt'
    })
  } else {
    processor = processor.use(rehypeHighlight, { ignoreMissing: true })
  }

  processor = processor
    .use(rehypeKatex)
    .use(rehypeHeadingIds)
    .use(rehypeStringify)

  processors[engine] = processor
  return processor
}

export async function renderMarkdownWithMathAndHtml(markdown: string, syntaxHighlightEngine: 'highlightjs' | 'shiki' = 'highlightjs'): Promise<string> {
  const { meta, body } = stripFrontMatter(markdown)
  const processor = getProcessorWithMathAndHtml(syntaxHighlightEngine)
  const rendered = await processor.process({
    value: body,
    data: { markdownSource: body },
  })
  return finalizeRenderedMarkdownHtml(meta, String(rendered))
}
