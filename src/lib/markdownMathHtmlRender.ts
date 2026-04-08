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
import { remarkSoftBreaks } from './remarkSoftBreaks.ts'

const processorWithMathAndHtml = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkSoftBreaks)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeKatex)
  .use(rehypeHeadingIds)
  .use(rehypeStringify)

export async function renderMarkdownWithMathAndHtml(markdown: string): Promise<string> {
  const { meta, body } = stripFrontMatter(markdown)
  const rendered = await processorWithMathAndHtml.process(body)
  return finalizeRenderedMarkdownHtml(meta, String(rendered))
}
