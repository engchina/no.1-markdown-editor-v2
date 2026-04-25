import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { buildReferenceAwareMarkdownSource } from './wysiwygReferenceLinks.ts'

export interface InlineRenderedFragmentRange {
  from: number
  to: number
  kind: 'image' | 'linked-media'
}

export interface InlineLinkRange {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

export interface InlineMediaRanges {
  renderedFragments: InlineRenderedFragmentRange[]
  links: InlineLinkRange[]
}

interface CollectInlineMediaRangesOptions {
  referenceDefinitionsMarkdown?: string
}

interface MarkdownAstNode {
  type: string
  children?: MarkdownAstNode[]
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
}

const inlineMediaCache = new Map<string, Map<string, InlineMediaRanges>>()
const inlineMediaAstParser = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)
// Keep the fast path cheap: only send lines through remark when they plausibly contain
// markdown links/images, angle-bracket autolinks, or GFM autolink literals.
const INLINE_MEDIA_CANDIDATE_PATTERN =
  /!?\[|<(?:https?:|mailto:|tel:|[^<>\s@]+@)|(?:https?:\/\/|mailto:|tel:|www\.)|(?:^|[\s(<])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/iu

export function collectInlineMediaRanges(
  text: string,
  options: CollectInlineMediaRangesOptions = {}
): InlineMediaRanges {
  if (!INLINE_MEDIA_CANDIDATE_PATTERN.test(text)) {
    return { renderedFragments: [], links: [] }
  }

  const referenceDefinitionsMarkdown = String(options.referenceDefinitionsMarkdown ?? '').trim()
  const cacheBucket = getInlineMediaCacheBucket(referenceDefinitionsMarkdown)
  const cached = cacheBucket.get(text)
  if (cached !== undefined) return cached

  const tree = inlineMediaAstParser.parse(
    buildReferenceAwareMarkdownSource(text, referenceDefinitionsMarkdown)
  ) as MarkdownAstNode
  const renderedFragments: InlineRenderedFragmentRange[] = []
  const links: InlineLinkRange[] = []

  collectInlineMediaRangesFromAst(tree, renderedFragments, links)

  const result = {
    renderedFragments: renderedFragments.sort((left, right) => left.from - right.from || left.to - right.to),
    links: links.sort((left, right) => left.from - right.from || left.to - right.to),
  }
  cacheBucket.set(text, result)
  return result
}

function getInlineMediaCacheBucket(referenceDefinitionsMarkdown: string): Map<string, InlineMediaRanges> {
  let cacheBucket = inlineMediaCache.get(referenceDefinitionsMarkdown)
  if (!cacheBucket) {
    cacheBucket = new Map<string, InlineMediaRanges>()
    inlineMediaCache.set(referenceDefinitionsMarkdown, cacheBucket)
  }

  return cacheBucket
}

function collectInlineMediaRangesFromAst(
  node: MarkdownAstNode,
  renderedFragments: InlineRenderedFragmentRange[],
  links: InlineLinkRange[],
  linkAncestor: MarkdownAstNode | null = null
): void {
  if (node.type === 'link' || node.type === 'linkReference') {
    const offsets = getNodeOffsets(node)
    if (!offsets) return

    if (hasImageDescendant(node)) {
      renderedFragments.push({
        from: offsets.from,
        to: offsets.to,
        kind: 'linked-media',
      })
      return
    }

    const contentOffsets = getNodeContentOffsets(node)
    if (contentOffsets) {
      links.push({
        from: offsets.from,
        to: offsets.to,
        contentFrom: contentOffsets.from,
        contentTo: contentOffsets.to,
      })
    }
  }

  if (node.type === 'image' || node.type === 'imageReference') {
    const offsets = getNodeOffsets(node)
    if (offsets && !linkAncestor) {
      renderedFragments.push({
        from: offsets.from,
        to: offsets.to,
        kind: 'image',
      })
    }
    return
  }

  const nextLinkAncestor = node.type === 'link' || node.type === 'linkReference'
    ? node
    : linkAncestor
  for (const child of node.children ?? []) {
    collectInlineMediaRangesFromAst(child, renderedFragments, links, nextLinkAncestor)
  }
}

function hasImageDescendant(node: MarkdownAstNode): boolean {
  if (node.type === 'image' || node.type === 'imageReference') return true
  return (node.children ?? []).some((child) => hasImageDescendant(child))
}

function getNodeOffsets(node: MarkdownAstNode): { from: number; to: number } | null {
  const from = node.position?.start?.offset
  const to = node.position?.end?.offset

  if (typeof from !== 'number' || typeof to !== 'number' || from >= to) {
    return null
  }

  return { from, to }
}

function getNodeContentOffsets(node: MarkdownAstNode): { from: number; to: number } | null {
  const offsets = (node.children ?? [])
    .map((child) => getNodeOffsets(child))
    .filter((entry): entry is { from: number; to: number } => entry !== null)

  if (offsets.length === 0) return null

  return {
    from: offsets[0].from,
    to: offsets[offsets.length - 1].to,
  }
}
