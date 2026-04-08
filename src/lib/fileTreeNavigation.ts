import type { FileNode } from '../store/fileTree'

export interface VisibleFileTreeNode {
  path: string
  type: FileNode['type']
  expanded?: boolean
  depth: number
  parentPath: string | null
}

export function flattenVisibleFileTree(
  tree: readonly FileNode[],
  depth = 0,
  parentPath: string | null = null
): VisibleFileTreeNode[] {
  const visible: VisibleFileTreeNode[] = []

  for (const node of tree) {
    visible.push({
      path: node.path,
      type: node.type,
      expanded: node.expanded,
      depth,
      parentPath,
    })

    if (node.type === 'dir' && node.expanded && node.children) {
      visible.push(...flattenVisibleFileTree(node.children, depth + 1, node.path))
    }
  }

  return visible
}

export function findVisibleTreeIndex(
  visibleNodes: readonly VisibleFileTreeNode[],
  path: string | null
): number {
  if (!path) return -1
  return visibleNodes.findIndex((node) => node.path === path)
}

export function getAdjacentVisibleTreePath(
  visibleNodes: readonly VisibleFileTreeNode[],
  path: string | null,
  delta: -1 | 1
): string | null {
  if (visibleNodes.length === 0) return null

  const currentIndex = findVisibleTreeIndex(visibleNodes, path)
  if (currentIndex === -1) {
    return delta > 0 ? visibleNodes[0].path : visibleNodes[visibleNodes.length - 1].path
  }

  const nextIndex = Math.max(0, Math.min(visibleNodes.length - 1, currentIndex + delta))
  return visibleNodes[nextIndex]?.path ?? null
}

export function getFirstChildVisibleTreePath(
  visibleNodes: readonly VisibleFileTreeNode[],
  path: string | null
): string | null {
  const currentIndex = findVisibleTreeIndex(visibleNodes, path)
  if (currentIndex === -1) return null

  const currentNode = visibleNodes[currentIndex]
  const nextNode = visibleNodes[currentIndex + 1]
  if (!nextNode || nextNode.depth !== currentNode.depth + 1 || nextNode.parentPath !== currentNode.path) {
    return null
  }

  return nextNode.path
}

export function getParentVisibleTreePath(
  visibleNodes: readonly VisibleFileTreeNode[],
  path: string | null
): string | null {
  const currentIndex = findVisibleTreeIndex(visibleNodes, path)
  if (currentIndex === -1) return null

  return visibleNodes[currentIndex].parentPath
}
