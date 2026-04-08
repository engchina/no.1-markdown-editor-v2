import { claimHeadingId, createHeadingIdState, reserveHeadingId } from './headingIds.ts'

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

interface HastNode {
  type?: string
  tagName?: string
  value?: string
  children?: HastNode[]
  properties?: Record<string, unknown>
}

export function rehypeHeadingIds() {
  return (tree: HastNode) => {
    const state = createHeadingIdState()

    walk(tree, (node) => {
      if (!isElement(node) || !HEADING_TAGS.has(node.tagName)) return

      const properties = node.properties ?? (node.properties = {})
      const existingId = readStringProperty(properties.id)?.trim()
      if (existingId) {
        reserveHeadingId(existingId, state)
        return
      }

      properties.id = claimHeadingId(getNodeText(node), state)
    })
  }
}

function isElement(node: HastNode): node is HastNode & { tagName: string; properties: Record<string, unknown> } {
  return node.type === 'element' && typeof node.tagName === 'string'
}

function walk(node: HastNode, visit: (node: HastNode) => void) {
  visit(node)

  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    walk(child, visit)
  }
}

function getNodeText(node: HastNode): string {
  if (typeof node.value === 'string') return node.value

  if (isElement(node) && node.tagName === 'img') {
    return readStringProperty(node.properties.alt) ?? ''
  }

  if (!Array.isArray(node.children)) return ''
  return node.children.map(getNodeText).join('')
}

function readStringProperty(value: unknown): string | null {
  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === 'string')
    return strings.length === 0 ? null : strings.join(' ')
  }

  return null
}
