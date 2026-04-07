import type { Plugin } from 'unified'

type MarkdownNode = {
  type: string
  value?: string
  children?: MarkdownNode[]
}

const SOFT_BREAK_PATTERN = /\r?\n/

function splitSoftBreakText(value: string): MarkdownNode[] {
  const parts = value.split(SOFT_BREAK_PATTERN)
  if (parts.length === 1) return [{ type: 'text', value }]

  const nodes: MarkdownNode[] = []
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (part) {
      nodes.push({ type: 'text', value: part })
    }

    if (index < parts.length - 1) {
      nodes.push({ type: 'break' })
    }
  }

  return nodes
}

function rewriteSoftBreaks(node: MarkdownNode): void {
  const { children } = node
  if (!children?.length) return

  const nextChildren: MarkdownNode[] = []
  for (const child of children) {
    if (child.type === 'text' && typeof child.value === 'string' && SOFT_BREAK_PATTERN.test(child.value)) {
      nextChildren.push(...splitSoftBreakText(child.value))
      continue
    }

    rewriteSoftBreaks(child)
    nextChildren.push(child)
  }

  node.children = nextChildren
}

// Match Typora-style preview behavior: a single Enter in a paragraph stays visually on a new line.
export const remarkSoftBreaks: Plugin<[], MarkdownNode> = () => {
  return (tree) => {
    rewriteSoftBreaks(tree)
  }
}
