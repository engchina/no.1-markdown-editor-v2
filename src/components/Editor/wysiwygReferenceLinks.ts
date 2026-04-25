import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

interface MarkdownAstNode {
  type: string
  children?: MarkdownAstNode[]
  identifier?: string
  label?: string
  title?: string | null
  url?: string
}

const referenceDefinitionParser = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })

let cachedReferenceDefinitionSource = ''
let cachedReferenceDefinitionMarkdown = ''

export function collectReferenceDefinitionMarkdown(markdown: string): string {
  const source = String(markdown ?? '')
  if (source === cachedReferenceDefinitionSource) return cachedReferenceDefinitionMarkdown

  const tree = referenceDefinitionParser.parse(source) as MarkdownAstNode
  const definitions = collectReferenceDefinitionNodes(tree)
    .map((node) => serializeReferenceDefinition(node))
    .filter((entry): entry is string => entry.length > 0)

  cachedReferenceDefinitionSource = source
  cachedReferenceDefinitionMarkdown = definitions.join('\n')
  return cachedReferenceDefinitionMarkdown
}

export function buildReferenceAwareMarkdownSource(
  markdown: string,
  referenceDefinitionsMarkdown?: string
): string {
  const source = String(markdown ?? '')
  const definitions = String(referenceDefinitionsMarkdown ?? '').trim()
  if (!source || !definitions) return source
  return `${source}\n\n${definitions}`
}

function collectReferenceDefinitionNodes(node: MarkdownAstNode): MarkdownAstNode[] {
  const definitions = node.type === 'definition' ? [node] : []

  for (const child of node.children ?? []) {
    definitions.push(...collectReferenceDefinitionNodes(child))
  }

  return definitions
}

function serializeReferenceDefinition(node: MarkdownAstNode): string {
  const label = escapeReferenceDefinitionLabel(node.label ?? node.identifier ?? '')
  const url = serializeReferenceDefinitionUrl(node.url)
  if (!label || !url) return ''

  const title = serializeReferenceDefinitionTitle(node.title)
  return title.length > 0
    ? `[${label}]: ${url} "${title}"`
    : `[${label}]: ${url}`
}

function escapeReferenceDefinitionLabel(label: string): string {
  return label
    .replace(/\\/gu, '\\\\')
    .replace(/\]/gu, '\\]')
}

function serializeReferenceDefinitionUrl(urlValue: unknown): string {
  const url = typeof urlValue === 'string' ? urlValue.trim() : ''
  if (!url) return ''

  if (/[\s<>]/u.test(url)) {
    const escaped = url
      .replace(/\\/gu, '\\\\')
      .replace(/</gu, '\\<')
      .replace(/>/gu, '\\>')
    return `<${escaped}>`
  }

  return url
}

function serializeReferenceDefinitionTitle(titleValue: unknown): string {
  const title = typeof titleValue === 'string'
    ? titleValue.replace(/\r?\n[ \t]*/gu, ' ').trim()
    : ''

  return title
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
}
