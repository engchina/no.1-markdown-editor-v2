export interface ClipboardHtmlAstNode {
  type: 'root' | 'element' | 'text'
  children: ClipboardHtmlAstNode[]
  tagName?: string
  attributes?: Record<string, string>
  textContent?: string
}

interface SerializedBlockEntry {
  markdown: string
  comparisonText: string
  source: 'block' | 'inline'
}

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

const STRUCTURED_TAGS = new Set([
  'a',
  'blockquote',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'kbd',
  'li',
  'mark',
  'ol',
  'pre',
  'strong',
  'sub',
  'sup',
  'table',
  'u',
  'ul',
])

const HTML_OVERRIDE_BLOCKER_TAGS = new Set([
  'a',
  'blockquote',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'img',
  'kbd',
  'mark',
  'pre',
  'sub',
  'sup',
  'table',
  'u',
])

const SKIPPED_TAGS = new Set([
  'head',
  'meta',
  'link',
  'script',
  'style',
  'noscript',
  'title',
  // Interactive UI chrome that documentation sites inject around content — never useful when pasted.
  'button',
  'template',
  'dialog',
  'iframe',
  'object',
  'embed',
  'canvas',
])
const START_FRAGMENT_COMMENT = '<!--StartFragment-->'
const END_FRAGMENT_COMMENT = '<!--EndFragment-->'

type TableAlignment = '' | 'left' | 'center' | 'right'

export function convertClipboardHtmlToMarkdown(html: string, plainText = ''): string | null {
  const normalizedPlainText = normalizePastedText(plainText)
  const root = parseClipboardHtml(html)
  if (!root) {
    return normalizedPlainText || null
  }

  const convertedMarkdown = cleanupMarkdown(renderClipboardHtmlAstToMarkdown(root))
  if (!convertedMarkdown) {
    return normalizedPlainText || null
  }

  if (shouldPreferPlainText(root, normalizedPlainText)) {
    return normalizedPlainText || convertedMarkdown
  }

  return convertedMarkdown
}

export function renderClipboardHtmlAstToMarkdown(root: ClipboardHtmlAstNode): string {
  return serializeBlocks(root.children, { listDepth: 0 }).join('\n\n')
}

function parseClipboardHtml(html: string): ClipboardHtmlAstNode | null {
  if (!html || typeof DOMParser === 'undefined') return null

  const normalizedHtml = extractClipboardHtmlFragment(html)
  if (!normalizedHtml) return null

  const parser = new DOMParser()
  const document = parser.parseFromString(normalizedHtml, 'text/html')
  return {
    type: 'root',
    children: Array.from(document.body.childNodes)
      .map((node) => domNodeToAst(node))
      .filter((node): node is ClipboardHtmlAstNode => node !== null),
  }
}

function domNodeToAst(node: Node): ClipboardHtmlAstNode | null {
  if (node.nodeType === 3) {
    return {
      type: 'text',
      textContent: node.textContent ?? '',
      children: [],
    }
  }

  if (node.nodeType !== 1) {
    return null
  }

  const element = node as Element
  const tagName = element.tagName.toLowerCase()
  if (SKIPPED_TAGS.has(tagName)) return null

  const attributes = Array.from(element.attributes).reduce<Record<string, string>>((acc, attribute) => {
    acc[attribute.name.toLowerCase()] = attribute.value
    return acc
  }, {})

  // Skip decorative / hidden elements that documentation sites inject into headings and content:
  //   - aria-hidden="true"   (screen-reader hidden, typically icons)
  //   - hidden attribute
  //   - role="presentation" / "none"
  //   - inline style "display:none" or "visibility:hidden"
  // Images keep their own semantics (alt text) so we don't strip them here.
  if (tagName !== 'img') {
    if ((attributes['aria-hidden'] ?? '').toLowerCase() === 'true') return null
    if ('hidden' in attributes) return null
    const role = (attributes['role'] ?? '').toLowerCase()
    if (role === 'presentation' || role === 'none') return null
    const style = attributes['style'] ?? ''
    if (/(?:^|;)\s*display\s*:\s*none\b/i.test(style)) return null
    if (/(?:^|;)\s*visibility\s*:\s*hidden\b/i.test(style)) return null
  }

  // Anchor targets: <a id="..."></a> or <a name="..."></a> with no href. These are landmarks,
  // not links, and should be dropped (mirrors Typora's paste behavior).
  if (tagName === 'a' && !attributes['href']) {
    const hasOnlyWhitespaceChildren = Array.from(element.childNodes).every(
      (child) => child.nodeType === 3 && (child.textContent ?? '').trim() === ''
    )
    if (hasOnlyWhitespaceChildren) return null
  }

  return {
    type: 'element',
    tagName,
    attributes,
    children: Array.from(element.childNodes)
      .map((child) => domNodeToAst(child))
      .filter((child): child is ClipboardHtmlAstNode => child !== null),
  }
}

function shouldPreferPlainText(root: ClipboardHtmlAstNode, plainText: string): boolean {
  if (!plainText) return false

  const plainImageCount = countMarkdownImages(plainText)
  const htmlImageCount = countHtmlImages(root)
  const plainHasStrongMarkdownSyntax = containsStrongMarkdownSyntax(plainText)

  if (plainHasStrongMarkdownSyntax && plainImageCount >= htmlImageCount && !htmlBlocksPlainTextOverride(root)) {
    return true
  }

  if (looksLikeMarkdownSource(plainText) && plainImageCount >= htmlImageCount && !htmlBlocksPlainTextOverride(root)) {
    return true
  }

  return !htmlAddsStructure(root)
}

function serializeBlocks(nodes: ClipboardHtmlAstNode[], context: { listDepth: number }): string[] {
  const blocks: SerializedBlockEntry[] = []
  let inlineBuffer = ''
  let inlineComparisonBuffer = ''

  const flushInlineBuffer = () => {
    const block = normalizeInlineMarkdown(inlineBuffer).trim()
    const comparisonText = normalizeComparisonText(inlineComparisonBuffer)
    if (block) {
      blocks.push({
        markdown: block,
        comparisonText,
        source: 'inline',
      })
    }
    inlineBuffer = ''
    inlineComparisonBuffer = ''
  }

  for (const node of nodes) {
    if (node.type === 'text') {
      inlineBuffer += serializeInlineText(node.textContent ?? '')
      inlineComparisonBuffer += extractComparisonText(node)
      continue
    }

    if (node.type !== 'element' || !node.tagName) continue

    if (node.tagName === 'br') {
      inlineBuffer += '\n'
      inlineComparisonBuffer += '\n'
      continue
    }

    if (!isBlockLikeNode(node)) {
      inlineBuffer += serializeInlineNode(node, context)
      inlineComparisonBuffer += extractComparisonText(node)
      continue
    }

    flushInlineBuffer()

    const block = serializeBlockNode(node, context).trim()
    if (block) {
      blocks.push({
        markdown: block,
        comparisonText: normalizeComparisonText(extractComparisonText(node)),
        source: 'block',
      })
    }
  }

  flushInlineBuffer()
  return dedupeEquivalentBlocks(blocks).map((entry) => entry.markdown)
}

function dedupeEquivalentBlocks(entries: SerializedBlockEntry[]): SerializedBlockEntry[] {
  return entries.filter((entry, index) => {
    if (entry.source !== 'inline' || !entry.comparisonText) {
      return true
    }

    return !matchesEquivalentStructuredRun(entries, index, entry.comparisonText)
  })
}

function matchesEquivalentStructuredRun(entries: SerializedBlockEntry[], startIndex: number, comparisonText: string): boolean {
  const previousBlocks = collectAdjacentStructuredBlocks(entries, startIndex, -1)
  const nextBlocks = collectAdjacentStructuredBlocks(entries, startIndex, 1)

  for (let previousCount = 0; previousCount <= previousBlocks.length; previousCount += 1) {
    for (let nextCount = 0; nextCount <= nextBlocks.length; nextCount += 1) {
      if (previousCount === 0 && nextCount === 0) {
        continue
      }

      const candidate = normalizeComparisonText(
        [
          ...previousBlocks.slice(previousBlocks.length - previousCount),
          ...nextBlocks.slice(0, nextCount),
        ].join('\n')
      )

      if (!candidate) {
        continue
      }

      if (candidate === comparisonText) {
        return true
      }

      if (candidate.length > comparisonText.length) {
        if (nextCount === 0) {
          break
        }
        continue
      }
    }
  }

  return false
}

function collectAdjacentStructuredBlocks(
  entries: SerializedBlockEntry[],
  startIndex: number,
  direction: -1 | 1
): string[] {
  const blocks: string[] = []

  for (let index = startIndex + direction; index >= 0 && index < entries.length; index += direction) {
    const entry = entries[index]
    if (entry.source !== 'block' || !entry.comparisonText) {
      break
    }

    if (direction === -1) {
      blocks.unshift(entry.comparisonText)
    } else {
      blocks.push(entry.comparisonText)
    }
  }

  return blocks
}

function serializeBlockNode(node: ClipboardHtmlAstNode, context: { listDepth: number }): string {
  if (node.type !== 'element' || !node.tagName) return ''
  if (isFootnotesContainer(node)) return serializeFootnotesSection(node, context)

  switch (node.tagName) {
    case 'p':
    case 'figcaption':
      return serializeInlineChildren(node.children, context).trim()
    case 'div':
    case 'article':
    case 'aside':
    case 'figure':
    case 'footer':
    case 'header':
    case 'main':
    case 'nav':
    case 'section':
      return serializeContainerNode(node.children, context)
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(node.tagName.slice(1))
      const content = serializeInlineChildren(node.children, context).trim()
      return content ? `${'#'.repeat(level)} ${content}` : ''
    }
    case 'blockquote': {
      const content = serializeBlocks(node.children, context).join('\n\n')
      return prefixLines(content, '> ')
    }
    case 'pre':
      return serializeCodeBlock(node)
    case 'ul':
      return serializeList(node.children, { ...context, ordered: false, start: 1 })
    case 'ol': {
      const start = Number(node.attributes?.start ?? '1')
      return serializeList(node.children, {
        ...context,
        ordered: true,
        start: Number.isFinite(start) ? start : 1,
      })
    }
    case 'hr':
      return '---'
    case 'table':
      return serializeTable(node, context)
    case 'img':
      return serializeImage(node)
    default:
      return serializeContainerNode(node.children, context)
  }
}

function serializeContainerNode(children: ClipboardHtmlAstNode[], context: { listDepth: number }): string {
  if (children.some((child) => isBlockLikeNode(child))) {
    return serializeBlocks(children, context).join('\n\n')
  }

  return serializeInlineChildren(children, context).trim()
}

function serializeInlineChildren(nodes: ClipboardHtmlAstNode[], context: { listDepth: number }): string {
  let output = ''

  for (const node of nodes) {
    if (node.type === 'text') {
      output += serializeInlineText(node.textContent ?? '')
      continue
    }

    if (node.type !== 'element' || !node.tagName) continue

    if (node.tagName === 'br') {
      output += '\n'
      continue
    }

    if (isBlockLikeNode(node)) {
      const blockResult = serializeBlockNode(node, context)
      if (blockResult) {
        if (output.length > 0 && !output.endsWith('\n')) output += '\n\n'
        output += blockResult + '\n\n'
      }
      continue
    }

    output += serializeInlineNode(node, context)
  }

  return normalizeInlineMarkdown(output)
}

function serializeInlineNode(node: ClipboardHtmlAstNode, context: { listDepth: number }): string {
  if (node.type !== 'element' || !node.tagName) return ''

  switch (node.tagName) {
    case 'a':
      return serializeLink(node, context)
    case 'b':
    case 'strong':
      return wrapInline('**', serializeInlineChildren(node.children, context).trim())
    case 'em':
    case 'i':
      return wrapInline('*', serializeInlineChildren(node.children, context).trim())
    case 'del':
    case 's':
      return wrapInline('~~', serializeInlineChildren(node.children, context).trim())
    case 'code':
      return wrapCodeSpan(extractTextContent(node, { preserveWhitespace: false }).trim())
    case 'img':
      return serializeImage(node)
    case 'input':
      return serializeCheckbox(node)
    case 'sup': {
      const footnoteReference = serializeFootnoteReference(node)
      if (footnoteReference) return footnoteReference
      return serializeSemanticInlineTag(node.tagName, node.children, context)
    }
    case 'kbd':
    case 'mark':
    case 'sub':
    case 'u':
      return serializeSemanticInlineTag(node.tagName, node.children, context)
    case 'span':
    case 'small':
      return serializeInlineChildren(node.children, context)
    default:
      return serializeInlineChildren(node.children, context)
  }
}

function serializeCheckbox(node: ClipboardHtmlAstNode): string {
  if (!isCheckboxNode(node)) return ''
  return (node.attributes?.checked ?? '') !== '' || 'checked' in (node.attributes ?? {}) ? '[x]' : '[ ]'
}

function serializeSemanticInlineTag(
  tagName: string,
  children: ClipboardHtmlAstNode[],
  context: { listDepth: number }
): string {
  const content = serializeInlineChildren(children, context).trim()
  return content ? `<${tagName}>${content}</${tagName}>` : ''
}

function serializeFootnoteReference(node: ClipboardHtmlAstNode): string | null {
  if (node.type !== 'element') return null

  const link = findFirstElement(node, isFootnoteReferenceLink)
  const label = extractFootnoteLabel(link?.attributes?.href ?? link?.attributes?.id ?? node.attributes?.id)
  if (!label) return null

  return `[^${escapeFootnoteLabel(label)}]`
}

function serializeLink(node: ClipboardHtmlAstNode, context: { listDepth: number }): string {
  const href = sanitizeUrl(node.attributes?.href)
  if (isBlockContainerLink(node)) {
    return serializeContainerNode(node.children, context)
  }
  const content = serializeInlineChildren(node.children, context).trim()
  if (!href) return content
  // Drop decorative/empty anchors (heading permalink icons, font-awesome-only links, etc.)
  // to match the behavior of editors like Typora. Keep autolinks only when the link points
  // to an external resource — internal fragment links with no visible text are never useful.
  if (!content) {
    if (/^#/.test(href) || isDecorativeAnchor(node)) return ''
    return `<${href}>`
  }
  return `[${content}](${formatMarkdownDestination(href)})`
}

function isDecorativeAnchor(node: ClipboardHtmlAstNode): boolean {
  // True when every descendant element is a decorative icon wrapper (i, svg, span, use, path)
  // and there is no visible text anywhere inside.
  const DECORATIVE_TAGS = new Set(['i', 'svg', 'use', 'path', 'span', 'small', 'g', 'title', 'desc'])
  const walk = (n: ClipboardHtmlAstNode): boolean => {
    if (n.type === 'text') return (n.textContent ?? '').trim() === ''
    if (n.type !== 'element' || !n.tagName) return true
    if (!DECORATIVE_TAGS.has(n.tagName)) return false
    return n.children.every(walk)
  }
  return node.children.every(walk)
}

function serializeImage(node: ClipboardHtmlAstNode): string {
  const src = getImageSource(node.attributes)
  if (!src) return ''

  // Typora-style clipboard conversions use a stable placeholder when the source image lacks alt text.
  const alt = escapeMarkdownText(node.attributes?.alt?.trim() || 'img')
  const title = node.attributes?.title?.trim()
  const destination = formatMarkdownDestination(src)
  const titleSuffix = title ? ` "${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : ''
  return `![${alt}](${destination}${titleSuffix})`
}

function serializeCodeBlock(node: ClipboardHtmlAstNode): string {
  const codeChild = node.children.find(
    (child): child is ClipboardHtmlAstNode => child.type === 'element' && child.tagName === 'code'
  )
  const language = extractCodeBlockLanguage(codeChild?.attributes?.class)
  const rawText = extractTextContent(codeChild ?? node, { preserveWhitespace: true }).replace(/\r\n?/g, '\n')
  const trimmedCode = rawText.replace(/\n+$/, '')
  const fence = repeatFence('`', trimmedCode, 3)
  const languageSuffix = language ? language : ''

  return `${fence}${languageSuffix}\n${trimmedCode}\n${fence}`
}

function serializeList(
  children: ClipboardHtmlAstNode[],
  context: { listDepth: number; ordered: boolean; start: number }
): string {
  const items = children.filter(
    (child): child is ClipboardHtmlAstNode => child.type === 'element' && child.tagName === 'li'
  )

  return items
    .map((item, index) =>
      serializeListItem(item, {
        listDepth: context.listDepth,
        ordered: context.ordered,
        index: context.start + index,
      })
    )
    .join('\n')
}

function serializeListItem(
  node: ClipboardHtmlAstNode,
  context: { listDepth: number; ordered: boolean; index: number }
): string {
  const marker = context.ordered ? `${context.index}.` : '-'
  const indent = '  '.repeat(context.listDepth)
  const prefix = `${indent}${marker} `
  const continuationPrefix = `${indent}${' '.repeat(marker.length + 1)}`
  const blocks = serializeBlocks(node.children, { listDepth: context.listDepth })

  if (blocks.length === 0) return prefix.trimEnd()

  return formatListItemBlocks(blocks, prefix, continuationPrefix)
}

function formatListItemBlocks(blocks: string[], prefix: string, continuationPrefix: string): string {
  const lines: string[] = []
  const [firstBlock, ...restBlocks] = blocks

  lines.push(...prefixBlock(firstBlock, prefix, continuationPrefix))
  for (const block of restBlocks) {
    lines.push(`${continuationPrefix.trimEnd()}`)
    lines.push(...prefixBlock(block, continuationPrefix, continuationPrefix))
  }

  return lines.join('\n')
}

function prefixBlock(block: string, firstPrefix: string, continuationPrefix: string): string[] {
  const lines = block.split('\n')
  return lines.map((line, index) => `${index === 0 ? firstPrefix : continuationPrefix}${line}`)
}

function serializeTable(node: ClipboardHtmlAstNode, context: { listDepth: number }): string {
  const rows = collectTableRows(node)
  if (rows.length === 0) {
    return serializeContainerNode(node.children, context)
  }

  const hasMergedCells = rows.some((row) =>
    row.some(
      (cell) =>
        (cell.attributes?.colspan !== undefined && cell.attributes.colspan !== '1') ||
        (cell.attributes?.rowspan !== undefined && cell.attributes.rowspan !== '1')
    )
  )
  if (hasMergedCells) {
    return serializeContainerNode(node.children, context)
  }

  const normalizedRows = rows.map((row) =>
    row.map((cell) => escapeTableCell(serializeContainerNode(cell.children, context).replace(/\n+/g, ' ').trim()))
  )
  const columnCount = normalizedRows.reduce((max, row) => Math.max(max, row.length), 0)
  const paddedRows = normalizedRows.map((row) =>
    row.length === columnCount ? row : [...row, ...Array.from({ length: columnCount - row.length }, () => '')]
  )
  const alignments = collectColumnAlignments(rows, columnCount)

  const headerRow = paddedRows[0]
  const separatorRow = alignments.map((alignment) => formatTableAlignment(alignment))
  const bodyRows = paddedRows.slice(1)

  return [headerRow, separatorRow, ...bodyRows]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n')
}

function serializeFootnotesSection(node: ClipboardHtmlAstNode, context: { listDepth: number }): string {
  const items = findFootnoteItems(node)
  return items
    .map((item, index) => serializeFootnoteDefinition(item, index + 1, context))
    .filter(Boolean)
    .join('\n\n')
}

function serializeFootnoteDefinition(
  node: ClipboardHtmlAstNode,
  fallbackIndex: number,
  context: { listDepth: number }
): string {
  if (node.type !== 'element') return ''

  const label = escapeFootnoteLabel(extractFootnoteLabel(node.attributes?.id) || String(fallbackIndex))
  const sanitizedNode = cloneAstWithoutNodes(node, isFootnoteBackrefLink)
  const blocks = sanitizedNode
    ? serializeBlocks(sanitizedNode.children, context)
        .map((block) => block.trim())
        .filter(Boolean)
    : []

  return formatFootnoteDefinition(label, blocks)
}

function formatFootnoteDefinition(label: string, blocks: string[]): string {
  if (blocks.length === 0) return `[^${label}]:`

  const lines: string[] = []
  const [firstBlock, ...restBlocks] = blocks
  const [firstLine = '', ...remainingFirstBlockLines] = firstBlock.split('\n')

  lines.push(`[^${label}]: ${firstLine}`)
  lines.push(...remainingFirstBlockLines.map((line) => `    ${line}`))

  for (const block of restBlocks) {
    lines.push('')
    lines.push(...block.split('\n').map((line) => `    ${line}`))
  }

  return lines.join('\n')
}

function collectTableRows(node: ClipboardHtmlAstNode): ClipboardHtmlAstNode[][] {
  if (node.type !== 'element') return []

  if (node.tagName === 'tr') {
    return [
      node.children.filter(
        (child): child is ClipboardHtmlAstNode =>
          child.type === 'element' && (child.tagName === 'th' || child.tagName === 'td')
      ),
    ]
  }

  return node.children.flatMap((child) => collectTableRows(child))
}

function collectColumnAlignments(rows: ClipboardHtmlAstNode[][], columnCount: number): TableAlignment[] {
  const alignments = Array.from({ length: columnCount }, (): TableAlignment => '')

  for (const row of rows) {
    row.forEach((cell, index) => {
      if (alignments[index]) return

      const alignment = getTableCellAlignment(cell)
      if (alignment) alignments[index] = alignment
    })
  }

  return alignments
}

function getTableCellAlignment(node: ClipboardHtmlAstNode): TableAlignment {
  if (node.type !== 'element') return ''

  const align = node.attributes?.align?.trim().toLowerCase()
  if (align === 'left' || align === 'center' || align === 'right') {
    return align
  }

  const style = node.attributes?.style ?? ''
  const match = style.match(/(?:^|;)\s*text-align\s*:\s*(left|center|right)\b/i)
  const styleAlign = match?.[1]?.toLowerCase()
  return styleAlign === 'left' || styleAlign === 'center' || styleAlign === 'right' ? styleAlign : ''
}

function formatTableAlignment(alignment: TableAlignment): string {
  switch (alignment) {
    case 'left':
      return ':---'
    case 'center':
      return ':---:'
    case 'right':
      return '---:'
    default:
      return '---'
  }
}

function extractTextContent(node: ClipboardHtmlAstNode, options: { preserveWhitespace: boolean }): string {
  if (node.type === 'text') {
    return options.preserveWhitespace ? node.textContent ?? '' : serializeInlineText(node.textContent ?? '')
  }

  if (node.type !== 'element') return ''
  if (node.tagName === 'br') return options.preserveWhitespace ? '\n' : '\n'

  return node.children.map((child) => extractTextContent(child, options)).join('')
}

function extractCodeBlockLanguage(className?: string): string {
  if (!className) return ''

  const match = className.match(/(?:language|lang)-([A-Za-z0-9_-]+)/i)
  return match?.[1] ?? ''
}

function serializeInlineText(text: string): string {
  if (!text) return ''
  return escapeMarkdownText(text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\s+/g, ' '))
}

function extractComparisonText(node: ClipboardHtmlAstNode): string {
  if (node.type === 'text') {
    return node.textContent ?? ''
  }

  if (node.type !== 'element') return ''
  if (node.tagName === 'br') return '\n'

  return node.children.map((child) => extractComparisonText(child)).join('')
}

function wrapInline(marker: string, content: string): string {
  return content ? `${marker}${content}${marker}` : ''
}

function wrapCodeSpan(content: string): string {
  if (!content) return ''

  const normalized = content.replace(/\r\n?/g, ' ').replace(/\s+/g, ' ')
  const fence = repeatFence('`', normalized, 1)
  const padded = normalized.startsWith('`') || normalized.endsWith('`') ? ` ${normalized} ` : normalized
  return `${fence}${padded}${fence}`
}

function repeatFence(marker: string, content: string, minimum: number): string {
  const matches = content.match(new RegExp(`${escapeForRegExp(marker)}+`, 'g')) ?? []
  const maxRunLength = matches.reduce((max, match) => Math.max(max, match.length), 0)
  return marker.repeat(Math.max(minimum, maxRunLength + 1))
}

function formatMarkdownDestination(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return /[\s()<>]/.test(trimmed) ? `<${trimmed.replace(/>/g, '%3E')}>` : trimmed
}

function getImageSource(attributes?: Record<string, string>): string {
  if (!attributes) return ''

  const src = sanitizeUrl(attributes.src)
  const lazySource =
    sanitizeUrl(attributes['data-src']) ||
    sanitizeUrl(attributes['data-original']) ||
    sanitizeUrl(attributes['data-actualsrc']) ||
    sanitizeUrl(attributes['data-lazy-src'])

  if (src && !looksLikePlaceholderImage(src)) return src
  return lazySource || src
}

function sanitizeUrl(value?: string): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''

  if (/^(?:javascript|vbscript):/i.test(trimmed)) return ''
  return trimmed
}

function looksLikePlaceholderImage(url: string): boolean {
  return (
    /^data:image\/gif;base64,R0lGODlhAQAB/i.test(url) ||
    /(?:spacer|blank|pixel)\.(?:gif|png|jpg|jpeg|webp)(?:$|[?#])/i.test(url)
  )
}

function isBlockLikeNode(node: ClipboardHtmlAstNode): boolean {
  return node.type === 'element' && !!node.tagName && (BLOCK_TAGS.has(node.tagName) || isBlockContainerLink(node))
}

function isBlockContainerLink(node: ClipboardHtmlAstNode): boolean {
  return node.type === 'element' && node.tagName === 'a' && hasBlockDescendant(node)
}

function hasBlockDescendant(node: ClipboardHtmlAstNode): boolean {
  return node.children.some((child) => {
    if (child.type !== 'element' || !child.tagName) return false
    return BLOCK_TAGS.has(child.tagName) || hasBlockDescendant(child)
  })
}

function htmlAddsStructure(node: ClipboardHtmlAstNode): boolean {
  if (node.type === 'element' && (isCheckboxNode(node) || isFootnotesContainer(node))) {
    return true
  }

  if (node.type === 'element' && node.tagName && STRUCTURED_TAGS.has(node.tagName)) {
    return true
  }

  return node.children.some((child) => htmlAddsStructure(child))
}

function countHtmlImages(node: ClipboardHtmlAstNode): number {
  const selfCount = node.type === 'element' && node.tagName === 'img' ? 1 : 0
  return selfCount + node.children.reduce((sum, child) => sum + countHtmlImages(child), 0)
}

function countMarkdownImages(markdown: string): number {
  return (markdown.match(/!\[[^\]]*]\([^)]+\)/g) ?? []).length
}

function containsStrongMarkdownSyntax(text: string): boolean {
  return (
    /(^|\n)\s*#{1,6}\s+\S/.test(text) ||
    /!\[[^\]]*]\([^)]+\)/.test(text) ||
    /\[[^\]]+]\([^)]+\)/.test(text) ||
    /(^|\n)\s*[-*+]\s+\[[ xX]\]\s+\S/.test(text) ||
    /(^|\n)\s*>\s+\S/.test(text) ||
    /(^|\n)```/.test(text) ||
    /(^|\n)\[\^[^\]]+]:\s+\S/.test(text) ||
    /\[\^[^\]]+]/.test(text)
  )
}

function looksLikeMarkdownSource(text: string): boolean {
  return (
    /(^|\n)\s*#{1,6}\s+\S/.test(text) ||
    /!\[[^\]]*]\([^)]+\)/.test(text) ||
    /\[[^\]]+]\([^)]+\)/.test(text) ||
    /(^|\n)\s*[-*+]\s+\S/.test(text) ||
    /(^|\n)\s*\d+\.\s+\S/.test(text) ||
    /(^|\n)\s*>\s+\S/.test(text) ||
    /(^|\n)```/.test(text)
  )
}

function normalizePastedText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
}

function normalizeComparisonText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractClipboardHtmlFragment(html: string): string {
  const normalizedHtml = html.replace(/\u0000/g, '').trim()
  if (!normalizedHtml) return ''

  const fragmentByComments = extractHtmlBetweenMarkers(normalizedHtml, START_FRAGMENT_COMMENT, END_FRAGMENT_COMMENT)
  if (fragmentByComments) return fragmentByComments

  if (!/^Version:/i.test(normalizedHtml)) return normalizedHtml

  return (
    extractClipboardHtmlByOffset(normalizedHtml, 'StartFragment', 'EndFragment') ||
    extractClipboardHtmlByOffset(normalizedHtml, 'StartHTML', 'EndHTML') ||
    normalizedHtml
  )
}

function normalizeInlineMarkdown(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
}

function cleanupMarkdown(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function prefixLines(content: string, prefix: string): string {
  return content
    .split('\n')
    .map((line) => `${prefix}${line}`.trimEnd())
    .join('\n')
}

function escapeMarkdownText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([`\[\]*])/g, '\\$1')
    .replace(/_/g, (_match, offset, str) => {
      const prev = str[offset - 1]
      const next = str[offset + 1]
      // Intra-word underscores (e.g. DBMS_CLOUD) are safe in CommonMark — no escaping needed
      if (prev && /[a-zA-Z0-9]/.test(prev) && next && /[a-zA-Z0-9]/.test(next)) {
        return '_'
      }
      return '\\_'
    })
}

function escapeTableCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractHtmlBetweenMarkers(html: string, startMarker: string, endMarker: string): string {
  const startIndex = html.indexOf(startMarker)
  const endIndex = html.indexOf(endMarker)
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) return ''

  return html.slice(startIndex + startMarker.length, endIndex).trim()
}

function extractClipboardHtmlByOffset(html: string, startKey: string, endKey: string): string {
  const start = getClipboardOffset(html, startKey)
  const end = getClipboardOffset(html, endKey)
  if (start === null || end === null || end <= start || start < 0 || end > html.length) return ''

  return html.slice(start, end).trim()
}

function getClipboardOffset(html: string, key: string): number | null {
  const match = html.match(new RegExp(`${escapeForRegExp(key)}:(\\d+)`, 'i'))
  if (!match) return null

  const offset = Number(match[1])
  return Number.isFinite(offset) ? offset : null
}

function htmlBlocksPlainTextOverride(node: ClipboardHtmlAstNode): boolean {
  if (node.type === 'element' && (isCheckboxNode(node) || isFootnotesContainer(node))) {
    return true
  }

  if (node.type === 'element' && node.tagName && HTML_OVERRIDE_BLOCKER_TAGS.has(node.tagName)) {
    return true
  }

  return node.children.some((child) => htmlBlocksPlainTextOverride(child))
}

function isCheckboxNode(node: ClipboardHtmlAstNode): node is ClipboardHtmlAstNode & { type: 'element' } {
  return node.type === 'element' && node.tagName === 'input' && node.attributes?.type?.trim().toLowerCase() === 'checkbox'
}

function isFootnotesContainer(node: ClipboardHtmlAstNode): boolean {
  return node.type === 'element' && (hasAttribute(node.attributes, 'data-footnotes', '') || hasClass(node, 'footnotes'))
}

function isFootnoteReferenceLink(node: ClipboardHtmlAstNode): boolean {
  if (node.type !== 'element' || node.tagName !== 'a') return false
  if (hasAttribute(node.attributes, 'data-footnote-ref', '')) return true

  const href = node.attributes?.href?.trim() ?? ''
  return /^#(?:user-content-)*fn(?:ref)?-?/i.test(href)
}

function isFootnoteBackrefLink(node: ClipboardHtmlAstNode): boolean {
  if (node.type !== 'element' || node.tagName !== 'a') return false
  if (hasAttribute(node.attributes, 'data-footnote-backref', '')) return true

  const href = node.attributes?.href?.trim() ?? ''
  return /^#(?:user-content-)*fnref-?/i.test(href)
}

function findFirstElement(
  node: ClipboardHtmlAstNode,
  predicate: (node: ClipboardHtmlAstNode) => boolean
): ClipboardHtmlAstNode | null {
  if (predicate(node)) return node

  for (const child of node.children) {
    const match = findFirstElement(child, predicate)
    if (match) return match
  }

  return null
}

function findFootnoteItems(node: ClipboardHtmlAstNode): ClipboardHtmlAstNode[] {
  const list = findFirstElement(
    node,
    (candidate) =>
      candidate.type === 'element' && (candidate.tagName === 'ol' || candidate.tagName === 'ul')
  )

  if (!list || list.type !== 'element') return []

  return list.children.filter(
    (child): child is ClipboardHtmlAstNode => child.type === 'element' && child.tagName === 'li'
  )
}

function cloneAstWithoutNodes(
  node: ClipboardHtmlAstNode,
  predicate: (node: ClipboardHtmlAstNode) => boolean
): ClipboardHtmlAstNode | null {
  if (predicate(node)) return null

  if (node.type !== 'element') {
    return { ...node }
  }

  return {
    ...node,
    children: node.children
      .map((child) => cloneAstWithoutNodes(child, predicate))
      .filter((child): child is ClipboardHtmlAstNode => child !== null),
  }
}

function extractFootnoteLabel(value?: string): string {
  if (!value) return ''

  const normalized = value.trim().replace(/^#/, '').replace(/^(?:user-content-)+/i, '')
  if (!normalized) return ''

  const match = normalized.match(/(?:^|-)fn(?:ref)?-?(.+)$/i)
  const label = (match?.[1] ?? normalized).replace(/^(?:user-content-)+/i, '').replace(/^-+/, '').trim()
  return label
}

function escapeFootnoteLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\s+/g, ' ')
}

function hasAttribute(attributes: Record<string, string> | undefined, name: string, fallback = ''): boolean {
  return (attributes?.[name] ?? fallback) !== fallback || name in (attributes ?? {})
}

function hasClass(node: ClipboardHtmlAstNode, className: string): boolean {
  if (node.type !== 'element') return false

  const classes = (node.attributes?.class ?? '').split(/\s+/).filter(Boolean)
  return classes.includes(className)
}
