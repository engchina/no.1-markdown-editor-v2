import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import rehypeKatex from 'rehype-katex'
import { sanitizeSchema } from '../../lib/markdownShared.ts'
import { rehypeHighlightMarkers } from '../../lib/rehypeHighlightMarkers.ts'
import { rehypeSubscriptMarkers } from '../../lib/rehypeSubscriptMarkers.ts'
import { rehypeSuperscriptMarkers } from '../../lib/rehypeSuperscriptMarkers.ts'
import { buildReferenceAwareMarkdownSource } from './wysiwygReferenceLinks.ts'

const inlineMarkdownCache = new Map<string, Map<string, string>>()
const inlineMarkdownWithTableBreakMarkersCache = new Map<string, Map<string, string>>()
const INLINE_HTML_BREAK_SEQUENCE_PATTERN = /^(?:\s*<br\s*\/?>\s*)+$/iu
const INLINE_HTML_BREAK_PATTERN = /<br\s*\/?>/giu
const DANGEROUS_INLINE_HTML_PATTERN =
  /<(script|style|iframe|object|embed|textarea|noscript)\b[\s\S]*?<\/\1\s*>/giu
const DANGEROUS_INLINE_HTML_OPENING_TAG_PATTERN =
  /<(script|style|iframe|object|embed|textarea|noscript)\b/iu
const INLINE_HTML_TAG_PATTERN = /<\/?[^>]+>/gu

interface RenderInlineMarkdownFragmentOptions {
  tableLineBreakMode?: 'render' | 'placeholder'
  referenceDefinitionsMarkdown?: string
}

const inlineMarkdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeInlineRawHtmlFallback)
  .use(rehypeSubscriptMarkers)
  .use(rehypeSuperscriptMarkers)
  .use(rehypeHighlightMarkers)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeKatex)
  .use(rehypeStringify)

export function renderInlineMarkdownFragment(
  markdown: string,
  options: RenderInlineMarkdownFragmentOptions = {}
): string {
  const source = String(markdown ?? '')
  const referenceDefinitionsMarkdown = String(options.referenceDefinitionsMarkdown ?? '').trim()
  const cache = options.tableLineBreakMode === 'placeholder'
    ? inlineMarkdownWithTableBreakMarkersCache
    : inlineMarkdownCache
  const cacheBucket = getInlineMarkdownCacheBucket(cache, referenceDefinitionsMarkdown)
  const cached = cacheBucket.get(source)
  if (cached !== undefined) return cached

  const rendered = String(
    inlineMarkdownProcessor.processSync(
      buildReferenceAwareMarkdownSource(source, referenceDefinitionsMarkdown)
    )
  )
  const normalized = stripSingleParagraphWrapper(rendered)
  const finalized = options.tableLineBreakMode === 'placeholder'
    ? replaceInlineBreaksWithTableMarkers(normalized)
    : normalized
  cacheBucket.set(source, finalized)
  return finalized
}

function getInlineMarkdownCacheBucket(
  cache: Map<string, Map<string, string>>,
  referenceDefinitionsMarkdown: string
): Map<string, string> {
  let cacheBucket = cache.get(referenceDefinitionsMarkdown)
  if (!cacheBucket) {
    cacheBucket = new Map<string, string>()
    cache.set(referenceDefinitionsMarkdown, cacheBucket)
  }

  return cacheBucket
}

function stripSingleParagraphWrapper(html: string): string {
  const trimmed = html.trim()
  const match = trimmed.match(/^<p>([\s\S]*)<\/p>$/u)
  return match ? match[1] : trimmed
}

function replaceInlineBreaksWithTableMarkers(html: string): string {
  return html.replace(
    /<br\s*\/?>/gu,
    '<span class="cm-wysiwyg-table__line-break-marker">&lt;br /&gt;</span>'
  )
}

function rehypeInlineRawHtmlFallback() {
  return function (tree: any) {
    replaceInlineRawHtmlNodes(tree)
  }
}

function replaceInlineRawHtmlNodes(node: any): void {
  if (!node || !Array.isArray(node.children)) return

  let activeDangerousTag: string | null = null
  const nextChildren: any[] = []

  for (const child of node.children) {
    if (child?.type === 'raw') {
      let rawValue = String(child.value ?? '')

      if (activeDangerousTag) {
        const remainingValue = splitAfterDangerousClosingTag(rawValue, activeDangerousTag)
        if (remainingValue === null) {
          continue
        }

        activeDangerousTag = null
        rawValue = remainingValue
      }

      rawValue = rawValue.replace(DANGEROUS_INLINE_HTML_PATTERN, '')
      const dangerousOpeningTag = findDangerousInlineHtmlOpeningTag(rawValue)
      if (dangerousOpeningTag) {
        const splitIndex = rawValue.search(DANGEROUS_INLINE_HTML_OPENING_TAG_PATTERN)
        const safePrefix = splitIndex > 0 ? rawValue.slice(0, splitIndex) : ''
        if (safePrefix) {
          nextChildren.push(...rawInlineHtmlToNodes(safePrefix))
        }

        const remainder = rawValue.slice(splitIndex)
        const remainingValue = splitAfterDangerousClosingTag(remainder, dangerousOpeningTag)
        if (remainingValue === null) {
          activeDangerousTag = dangerousOpeningTag
          continue
        }

        rawValue = remainingValue
      }

      nextChildren.push(...rawInlineHtmlToNodes(rawValue))
      continue
    }

    if (activeDangerousTag) {
      continue
    }

    replaceInlineRawHtmlNodes(child)
    nextChildren.push(child)
  }

  node.children = nextChildren
}

function rawInlineHtmlToNodes(value: string): any[] {
  if (INLINE_HTML_BREAK_SEQUENCE_PATTERN.test(value)) {
    return Array.from(value.matchAll(INLINE_HTML_BREAK_PATTERN), () => ({
      type: 'element',
      tagName: 'br',
      properties: {},
      children: [],
    }))
  }

  const safeText = value
    .replace(DANGEROUS_INLINE_HTML_PATTERN, '')
    .replace(INLINE_HTML_TAG_PATTERN, '')
    .trim()

  return safeText ? [{ type: 'text', value: safeText }] : []
}

function findDangerousInlineHtmlOpeningTag(value: string): string | null {
  const match = DANGEROUS_INLINE_HTML_OPENING_TAG_PATTERN.exec(value)
  return match ? match[1].toLowerCase() : null
}

function splitAfterDangerousClosingTag(value: string, tagName: string): string | null {
  const closingTagPattern = new RegExp(`</${tagName}\\s*>`, 'iu')
  const match = closingTagPattern.exec(value)
  if (!match) return null

  return value.slice(match.index + match[0].length)
}
