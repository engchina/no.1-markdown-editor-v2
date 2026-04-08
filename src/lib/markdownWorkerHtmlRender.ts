import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { finalizeRenderedMarkdownHtml, sanitizeSchema, stripFrontMatter } from './markdownShared.ts'
import { rehypeHeadingIds } from './rehypeHeadingIds.ts'
import { remarkSoftBreaks } from './remarkSoftBreaks.ts'

const workerHtmlProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSoftBreaks)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeHeadingIds)
  .use(rehypeStringify)

export async function renderMarkdownWithHtmlInWorker(markdown: string): Promise<string> {
  const { meta, body } = stripFrontMatter(markdown)
  const rendered = await workerHtmlProcessor.process(body)
  return finalizeRenderedMarkdownHtml(meta, String(rendered))
}
