import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import rehypeKatex from 'rehype-katex'
import { buildFrontMatterHtml, sanitizeSchema, stripFrontMatter } from './markdownShared.ts'
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
  .use(rehypeSlug)
  .use(rehypeStringify)

export async function renderMarkdownWithMathAndHtml(markdown: string): Promise<string> {
  const { meta, body } = stripFrontMatter(markdown)
  const rendered = await processorWithMathAndHtml.process(body)
  return buildFrontMatterHtml(meta) + String(rendered)
}
