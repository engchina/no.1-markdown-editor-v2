import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import {
  buildFrontMatterHtml,
  buildStandaloneHtml,
  containsLikelyMath,
  sanitizeSchema,
  stripFrontMatter,
} from './markdownShared.ts'
import { containsLikelyRawHtml } from './markdownHtml.ts'

const processorWithoutMath = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeSlug)
  .use(rehypeStringify)

let mathRendererPromise: Promise<typeof import('./markdownMathRender.ts')> | null = null
let htmlRendererPromise: Promise<typeof import('./markdownHtmlRender.ts')> | null = null
let mathHtmlRendererPromise: Promise<typeof import('./markdownMathHtmlRender.ts')> | null = null

async function renderBaseMarkdown(markdown: string): Promise<string> {
  const { meta, body } = stripFrontMatter(markdown)
  const rendered = await processorWithoutMath.process(body)
  return buildFrontMatterHtml(meta) + String(rendered)
}

export { buildFrontMatterHtml, buildStandaloneHtml, containsLikelyMath, stripFrontMatter }

export async function renderMarkdown(markdown: string): Promise<string> {
  const { body } = stripFrontMatter(markdown)
  const hasMath = containsLikelyMath(body)
  const hasRawHtml = containsLikelyRawHtml(body)

  if (!hasMath && !hasRawHtml) {
    return renderBaseMarkdown(markdown)
  }

  if (!hasMath) {
    htmlRendererPromise ??= import('./markdownHtmlRender.ts')
    const { renderMarkdownWithHtml } = await htmlRendererPromise
    return renderMarkdownWithHtml(markdown)
  }

  if (!hasRawHtml) {
    mathRendererPromise ??= import('./markdownMathRender.ts')
    const { renderMarkdownWithMath } = await mathRendererPromise
    return renderMarkdownWithMath(markdown)
  }

  mathHtmlRendererPromise ??= import('./markdownMathHtmlRender.ts')
  const { renderMarkdownWithMathAndHtml } = await mathHtmlRendererPromise
  return renderMarkdownWithMathAndHtml(markdown)
}
