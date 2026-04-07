import { useCallback } from 'react'
import { useEditorStore } from '../store/editor'
import { useFileTreeStore, type FileNode } from '../store/fileTree'
import { useRecentFilesStore } from '../store/recentFiles'
import { pushErrorNotice } from '../lib/notices'

export type { FileNode } from '../store/fileTree'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const MARKDOWN_FILE_PATTERN = /\.(md|markdown|mdx|txt)$/i

async function readDirTauri(dirPath: string): Promise<FileNode[]> {
  const { readDir } = await import('@tauri-apps/plugin-fs')
  const { join } = await import('@tauri-apps/api/path')
  const entries = await readDir(dirPath)

  const nodes: Array<FileNode | null> = await Promise.all(
    entries
      .filter((entry) => entry.name && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const childPath = await join(dirPath, entry.name)

        if (entry.isDirectory) {
          return {
            name: entry.name,
            path: childPath,
            type: 'dir' as const,
            children: undefined,
            expanded: false,
          }
        }

        if (entry.isFile && MARKDOWN_FILE_PATTERN.test(entry.name)) {
          return {
            name: entry.name,
            path: childPath,
            type: 'file' as const,
          }
        }

        return null
      })
  )

  return nodes
    .filter((node): node is FileNode => node !== null)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

function updateTreeNode(
  tree: FileNode[],
  pathInTree: number[],
  updater: (node: FileNode) => void
): FileNode[] {
  const next = structuredClone(tree)
  let cursor = next
  let target: FileNode | null = null

  for (let index = 0; index < pathInTree.length; index++) {
    const pathIndex = pathInTree[index]
    target = cursor[pathIndex]
    if (!target) return tree
    if (index < pathInTree.length - 1) {
      cursor = target.children ?? []
    }
  }

  if (!target) return tree
  updater(target)
  return next
}

export function useFileTree() {
  const rootPath = useFileTreeStore((state) => state.rootPath)
  const tree = useFileTreeStore((state) => state.tree)
  const loading = useFileTreeStore((state) => state.loading)
  const setRootPath = useFileTreeStore((state) => state.setRootPath)
  const setTree = useFileTreeStore((state) => state.setTree)
  const setLoading = useFileTreeStore((state) => state.setLoading)
  const openDocument = useEditorStore((state) => state.openDocument)
  const addRecent = useRecentFilesStore((state) => state.addRecent)

  const openFolder = useCallback(async () => {
    if (!isTauri) return

    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (!selected || typeof selected !== 'string') return

      setLoading(true)
      setRootPath(selected)
      const nodes = await readDirTauri(selected)
      setTree(nodes)
    } catch (error) {
      console.error('Open folder error:', error)
      pushErrorNotice('notices.openFolderErrorTitle', 'notices.openFolderErrorMessage')
    } finally {
      setLoading(false)
    }
  }, [setLoading, setRootPath, setTree])

  const toggleDir = useCallback(
    async (node: FileNode, pathInTree: number[]) => {
      if (!isTauri || node.type !== 'dir') return

      const shouldLoadChildren = !node.expanded && !node.children
      useFileTreeStore.setState((state) => ({
        tree: updateTreeNode(state.tree, pathInTree, (target) => {
          if (shouldLoadChildren) {
            target.expanded = true
            target.children = []
            return
          }

          target.expanded = !target.expanded
        }),
      }))

      if (!shouldLoadChildren) return

      try {
        const children = await readDirTauri(node.path)
        useFileTreeStore.setState((state) => ({
          tree: updateTreeNode(state.tree, pathInTree, (target) => {
            target.children = children
          }),
        }))
      } catch (error) {
        console.error('Read dir error:', error)
        pushErrorNotice('notices.openFolderErrorTitle', 'notices.openFolderErrorMessage')
        useFileTreeStore.setState((state) => ({
          tree: updateTreeNode(state.tree, pathInTree, (target) => {
            target.children = []
            target.expanded = false
          }),
        }))
      }
    },
    []
  )

  const openFile = useCallback(
    async (node: FileNode) => {
      if (!isTauri || node.type !== 'file') return

      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        const content = await readTextFile(node.path)
        openDocument({
          path: node.path,
          name: node.name,
          content,
          savedContent: content,
          isDirty: false,
        })
        addRecent(node.path, node.name)
      } catch (error) {
        console.error('Open file error:', error)
        pushErrorNotice('notices.openFileErrorTitle', 'notices.openFileErrorMessage')
      }
    },
    [addRecent, openDocument]
  )

  return { rootPath, tree, loading, openFolder, toggleDir, openFile }
}
