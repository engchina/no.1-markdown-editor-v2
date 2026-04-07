import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import rehypeKatex from 'rehype-katex'
import {
  buildFrontMatterHtml,
  sanitizeSchema,
  stripFrontMatter,
} from './markdownShared.ts'

const processorWithMath = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeKatex)
  .use(rehypeSlug)
  .use(rehypeStringify)

export async function renderMarkdownWithMath(markdown: string): Promise<string> {
  const { meta, body } = stripFrontMatter(markdown)
  const rendered = await processorWithMath.process(body)
  return buildFrontMatterHtml(meta) + String(rendered)
}
