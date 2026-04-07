import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import { buildFrontMatterHtml, sanitizeSchema, stripFrontMatter } from './markdownShared.ts'
import { containsLikelyRawHtml } from './markdownHtml.ts'

const workerProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeSlug)
  .use(rehypeStringify)

export async function renderMarkdownInWorker(markdown: string): Promise<string> {
  const frontMatter = stripFrontMatter(markdown)
  if (containsLikelyRawHtml(frontMatter.body)) {
    const { renderMarkdownWithHtmlInWorker } = await import('./markdownWorkerHtmlRender.ts')
    return renderMarkdownWithHtmlInWorker(markdown)
  }

  const rendered = await workerProcessor.process(frontMatter.body)
  return buildFrontMatterHtml(frontMatter.meta) + String(rendered)
}
