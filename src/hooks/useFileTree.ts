import { useCallback, useEffect, useRef } from 'react'
import { useAIStore } from '../store/ai'
import { useEditorStore } from '../store/editor'
import { useFileTreeStore, type FileNode } from '../store/fileTree'
import { useRecentFilesStore } from '../store/recentFiles'
import { ensureFsPathAccess, ensureFsPathAccessBatch } from '../lib/fsAccess'
import { pushErrorNotice, pushSuccessNotice } from '../lib/notices'
import { getWorkspaceIndexSnapshot, invalidateWorkspaceIndexPaths } from '../lib/workspaceIndex/index.ts'
import {
  buildWorkspaceAssetRepairPlan,
  countWorkspaceAssetRepairPlanReferences,
  rewriteWorkspaceAssetReferences,
} from '../lib/workspaceAssetRepair'
import {
  ensureMarkdownFileName,
  getPathBaseName,
  pathMatchesPrefix,
  validateMoveDestination,
  validateFileTreeEntryName,
  type FileTreeOperationFailureReason,
  type FileTreeTargetLike,
} from '../lib/fileTreePaths'

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

async function buildTreeSnapshot(dirPath: string, previousNodes: FileNode[] = []): Promise<FileNode[]> {
  const nodes = await readDirTauri(dirPath)

  return Promise.all(
    nodes.map(async (node) => {
      if (node.type !== 'dir') return node

      const previousNode = previousNodes.find(
        (candidate): candidate is FileNode & { type: 'dir' } => candidate.type === 'dir' && candidate.path === node.path
      )
      const expanded = previousNode?.expanded === true
      if (!expanded) {
        return { ...node, expanded: false, children: undefined }
      }

      try {
        const children = await buildTreeSnapshot(node.path, previousNode.children ?? [])
        return {
          ...node,
          expanded: true,
          children,
        }
      } catch {
        return {
          ...node,
          expanded: true,
          children: [],
        }
      }
    })
  )
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
  const remapTabsForPathChange = useEditorStore((state) => state.remapTabsForPathChange)
  const closeTabsByPathPrefix = useEditorStore((state) => state.closeTabsByPathPrefix)
  const remapHistoryForPathChange = useAIStore((state) => state.remapHistoryForPathChange)
  const removeHistoryByPathPrefix = useAIStore((state) => state.removeHistoryByPathPrefix)
  const addRecent = useRecentFilesStore((state) => state.addRecent)
  const remapRecentForPathChange = useRecentFilesStore((state) => state.remapRecentForPathChange)
  const removeRecentByPathPrefix = useRecentFilesStore((state) => state.removeRecentByPathPrefix)
  const loadedRootRef = useRef<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshTree = useCallback(
    async (targetRootPath: string, previousTree: FileNode[] = []) => {
      await ensureFsPathAccess(targetRootPath, { kind: 'dir', recursive: true })
      const snapshot = await buildTreeSnapshot(targetRootPath, previousTree)
      setTree(snapshot)
    },
    [setTree]
  )

  useEffect(() => {
    if (!isTauri || !rootPath || loadedRootRef.current === rootPath) return

    loadedRootRef.current = rootPath
    setLoading(true)

    void refreshTree(rootPath)
      .catch((error) => {
        console.error('Restore folder error:', error)
        loadedRootRef.current = null
        setRootPath(null)
        setTree([])
        pushErrorNotice('notices.openFolderErrorTitle', 'notices.openFolderErrorMessage')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [refreshTree, rootPath, setLoading, setRootPath, setTree])

  useEffect(() => {
    if (!isTauri || !rootPath) return

    let disposed = false
    let unwatch: (() => void) | undefined

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(() => {
        const currentTree = useFileTreeStore.getState().tree
        setLoading(true)
        void refreshTree(rootPath, currentTree)
          .catch((error) => {
            console.error('Refresh folder tree error:', error)
            loadedRootRef.current = null
            setRootPath(null)
            setTree([])
            pushErrorNotice('notices.openFolderErrorTitle', 'notices.openFolderErrorMessage')
          })
          .finally(() => {
            setLoading(false)
          })
      }, 220)
    }

    void (async () => {
      try {
        await ensureFsPathAccess(rootPath, { kind: 'dir', recursive: true })
        const { watch } = await import('@tauri-apps/plugin-fs')
        if (disposed) return

        unwatch = await watch(rootPath, (event) => {
          invalidateWorkspaceIndexPaths(rootPath, event.paths)
          scheduleRefresh()
        }, {
          recursive: true,
          delayMs: 180,
        })
      } catch (error) {
        console.error('Watch folder tree error:', error)
      }
    })()

    return () => {
      disposed = true
      if (unwatch) unwatch()
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [refreshTree, rootPath, setLoading, setRootPath, setTree])

  const openFolder = useCallback(async () => {
    if (!isTauri) return

    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (!selected || typeof selected !== 'string') return

      loadedRootRef.current = selected
      setLoading(true)
      setRootPath(selected)
      await refreshTree(selected)
    } catch (error) {
      console.error('Open folder error:', error)
      loadedRootRef.current = null
      setRootPath(null)
      setTree([])
      pushErrorNotice('notices.openFolderErrorTitle', 'notices.openFolderErrorMessage')
    } finally {
      setLoading(false)
    }
  }, [refreshTree, setLoading, setRootPath, setTree])

  const toggleDir = useCallback(
    async (node: FileNode, pathInTree: number[]) => {
      if (!isTauri || node.type !== 'dir') return

      if (node.expanded) {
        useFileTreeStore.setState((state) => ({
          tree: updateTreeNode(state.tree, pathInTree, (target) => {
            target.expanded = false
          }),
        }))
        return
      }

      useFileTreeStore.setState((state) => ({
        tree: updateTreeNode(state.tree, pathInTree, (target) => {
          target.expanded = true
          target.children = []
        }),
      }))

      try {
        const children = await buildTreeSnapshot(node.path, node.children ?? [])
        useFileTreeStore.setState((state) => ({
          tree: updateTreeNode(state.tree, pathInTree, (target) => {
            target.children = children
            target.expanded = true
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

  const propagateWorkspaceAssetPathChange = useCallback(
    async (oldPath: string, newPath: string, snapshot: Awaited<ReturnType<typeof getWorkspaceIndexSnapshot>> | null) => {
      if (!rootPath || !snapshot) return

      const plan = buildWorkspaceAssetRepairPlan(snapshot, oldPath, newPath)
      if (plan.length === 0) return

      const { tabs } = useEditorStore.getState()
      const tabsByPath = new Map(
        tabs
          .filter((tab) => tab.path)
          .map((tab) => [normalizeWorkspacePath(tab.path ?? ''), tab] as const)
      )

      const documentsToRead = plan
        .filter((entry) => !tabsByPath.has(normalizeWorkspacePath(entry.documentPath)))
        .map((entry) => entry.documentPath)

      if (documentsToRead.length > 0) {
        await ensureFsPathAccessBatch(documentsToRead)
      }

      const { readTextFile, writeTextFile } = await import('@tauri-apps/plugin-fs')
      const workItems: Array<{
        documentPath: string
        documentKey: string
        updates: (typeof plan)[number]['updates']
        nextDiskContent: string
        tabId?: string
        nextTabContent?: string
        nextTabSavedContent?: string
      }> = []
      const failedDocumentKeys = new Set<string>()

      for (const entry of plan) {
        const documentKey = normalizeWorkspacePath(entry.documentPath)
        const openTab = tabsByPath.get(documentKey)

        if (openTab?.path) {
          const nextSavedContent = rewriteWorkspaceAssetReferences(openTab.savedContent, entry.updates)
          const nextContent = rewriteWorkspaceAssetReferences(openTab.content, entry.updates)
          if (nextSavedContent === null || nextContent === null) {
            failedDocumentKeys.add(documentKey)
            continue
          }

          workItems.push({
            documentPath: openTab.path,
            documentKey,
            updates: entry.updates,
            nextDiskContent: nextSavedContent,
            tabId: openTab.id,
            nextTabContent: nextContent,
            nextTabSavedContent: nextSavedContent,
          })
          continue
        }

        try {
          const diskContent = await readTextFile(entry.documentPath)
          const nextDiskContent = rewriteWorkspaceAssetReferences(diskContent, entry.updates)
          if (nextDiskContent === null) {
            failedDocumentKeys.add(documentKey)
            continue
          }

          workItems.push({
            documentPath: entry.documentPath,
            documentKey,
            updates: entry.updates,
            nextDiskContent,
          })
        } catch (error) {
          console.error('Read workspace document for asset propagation error:', error)
          failedDocumentKeys.add(documentKey)
        }
      }

      if (workItems.length === 0) {
        pushErrorNotice('notices.assetPathPropagationFailedTitle', 'notices.assetPathPropagationFailedMessage')
        return
      }

      await ensureFsPathAccessBatch(workItems.map((item) => item.documentPath))

      const successfulDocumentKeys = new Set<string>()
      const successfulTabUpdates = new Map<string, { content: string; savedContent: string }>()

      for (const item of workItems) {
        try {
          await writeTextFile(item.documentPath, item.nextDiskContent)
          successfulDocumentKeys.add(item.documentKey)

          if (item.tabId && item.nextTabContent !== undefined && item.nextTabSavedContent !== undefined) {
            successfulTabUpdates.set(item.tabId, {
              content: item.nextTabContent,
              savedContent: item.nextTabSavedContent,
            })
          }
        } catch (error) {
          console.error('Write workspace document for asset propagation error:', error)
          failedDocumentKeys.add(item.documentKey)
        }
      }

      if (successfulTabUpdates.size > 0) {
        useEditorStore.setState((state) => ({
          tabs: state.tabs.map((tab) => {
            const update = successfulTabUpdates.get(tab.id)
            if (!update) return tab

            return {
              ...tab,
              content: update.content,
              savedContent: update.savedContent,
              isDirty: update.content !== update.savedContent,
            }
          }),
        }))
      }

      if (successfulDocumentKeys.size > 0) {
        invalidateWorkspaceIndexPaths(rootPath, [oldPath, newPath, ...Array.from(successfulDocumentKeys)])
      }

      const successfulPlan = plan.filter((entry) => successfulDocumentKeys.has(normalizeWorkspacePath(entry.documentPath)))
      const updatedDocumentCount = successfulPlan.length
      const updatedReferenceCount = countWorkspaceAssetRepairPlanReferences(successfulPlan)
      const failedDocumentCount = new Set(
        Array.from(failedDocumentKeys).filter((documentKey) => !successfulDocumentKeys.has(documentKey))
      ).size

      if (failedDocumentCount > 0 && updatedDocumentCount > 0) {
        pushErrorNotice('notices.assetPathPropagationPartialTitle', 'notices.assetPathPropagationPartialMessage', {
          values: {
            references: updatedReferenceCount,
            documents: updatedDocumentCount,
            failed: failedDocumentCount,
          },
        })
        return
      }

      if (updatedDocumentCount > 0) {
        pushSuccessNotice('notices.assetPathPropagationSuccessTitle', 'notices.assetPathPropagationSuccessMessage', {
          values: {
            references: updatedReferenceCount,
            documents: updatedDocumentCount,
          },
        })
        return
      }

      pushErrorNotice('notices.assetPathPropagationFailedTitle', 'notices.assetPathPropagationFailedMessage')
    },
    [rootPath]
  )

  const createEntry = useCallback(
    async (
      parentDirPath: string,
      rawName: string,
      type: 'file' | 'dir'
    ): Promise<{ ok: true; path: string; name: string } | { ok: false; reason: 'empty' | 'reserved' | 'invalid' | 'exists' | 'unknown' }> => {
      const normalizedInput = rawName.trim()
      const validation = validateFileTreeEntryName(normalizedInput)
      if (validation) {
        return { ok: false, reason: validation }
      }

      const name = type === 'file' ? ensureMarkdownFileName(normalizedInput) : normalizedInput
      const [{ join }, { exists, mkdir, writeTextFile }] = await Promise.all([
        import('@tauri-apps/api/path'),
        import('@tauri-apps/plugin-fs'),
      ])

      const targetPath = await join(parentDirPath, name)
      if (await exists(targetPath)) {
        return { ok: false, reason: 'exists' }
      }

      try {
        if (type === 'dir') {
          await mkdir(targetPath)
        } else {
          await writeTextFile(targetPath, '')
        }

        const currentTree = useFileTreeStore.getState().tree
        if (rootPath) {
          await refreshTree(rootPath, currentTree)
        }

        return { ok: true, path: targetPath, name }
      } catch (error) {
        console.error(`Create ${type} error:`, error)
        return { ok: false, reason: 'unknown' }
      }
    },
    [refreshTree, rootPath]
  )

  const createFile = useCallback(
    async (parentDirPath: string, rawName: string) => {
      const result = await createEntry(parentDirPath, rawName, 'file')
      if (!result.ok) return result

      openDocument({
        path: result.path,
        name: result.name,
        content: '',
        savedContent: '',
        isDirty: false,
      })
      addRecent(result.path, result.name)
      return result
    },
    [addRecent, createEntry, openDocument]
  )

  const createFolder = useCallback(
    async (parentDirPath: string, rawName: string) => createEntry(parentDirPath, rawName, 'dir'),
    [createEntry]
  )

  const renameNode = useCallback(
    async (
      node: FileTreeTargetLike,
      rawName: string
    ): Promise<{ ok: true; path: string; name: string } | { ok: false; reason: 'empty' | 'reserved' | 'invalid' | 'exists' | 'unknown' }> => {
      const normalizedInput = rawName.trim()
      const validation = validateFileTreeEntryName(normalizedInput)
      if (validation) {
        return { ok: false, reason: validation }
      }

      const currentName = node.name
      const nextName =
        node.type === 'file' && !/\.[A-Za-z0-9]+$/.test(normalizedInput) && /\.[A-Za-z0-9]+$/.test(currentName)
          ? `${normalizedInput}${currentName.slice(currentName.lastIndexOf('.'))}`
          : normalizedInput

      try {
        const assetRepairSnapshot =
          rootPath && node.type === 'dir'
            ? await getWorkspaceIndexSnapshot(rootPath).catch((error) => {
                console.error('Load workspace snapshot for asset propagation error:', error)
                return null
              })
            : null
        const [{ dirname, join }, { exists, rename }] = await Promise.all([
          import('@tauri-apps/api/path'),
          import('@tauri-apps/plugin-fs'),
        ])
        const parentDirPath = await dirname(node.path)
        const nextPath = await join(parentDirPath, nextName)
        if (nextPath === node.path) {
          return { ok: true, path: nextPath, name: nextName }
        }

        if (await exists(nextPath)) {
          return { ok: false, reason: 'exists' }
        }

        await rename(node.path, nextPath)
        remapTabsForPathChange(node.path, nextPath)
        remapHistoryForPathChange(node.path, nextPath)
        remapRecentForPathChange(node.path, nextPath)
        if (node.type === 'file') addRecent(nextPath, nextName)
        if (node.type === 'dir') {
          await propagateWorkspaceAssetPathChange(node.path, nextPath, assetRepairSnapshot)
        }

        const currentTree = useFileTreeStore.getState().tree
        if (rootPath) {
          await refreshTree(rootPath, currentTree)
        }

        return { ok: true, path: nextPath, name: nextName }
      } catch (error) {
        console.error('Rename node error:', error)
        return { ok: false, reason: 'unknown' }
      }
    },
    [addRecent, propagateWorkspaceAssetPathChange, refreshTree, remapHistoryForPathChange, remapRecentForPathChange, remapTabsForPathChange, rootPath]
  )

  const deleteNode = useCallback(
    async (node: FileTreeTargetLike): Promise<boolean> => {
      try {
        const { remove } = await import('@tauri-apps/plugin-fs')
        await remove(node.path, { recursive: node.type === 'dir' })
        closeTabsByPathPrefix(node.path)
        removeHistoryByPathPrefix(node.path)
        removeRecentByPathPrefix(node.path)

        const currentTree = useFileTreeStore.getState().tree.filter((entry) => !pathMatchesPrefix(entry.path, node.path))
        if (rootPath) {
          await refreshTree(rootPath, currentTree)
        }

        return true
      } catch (error) {
        console.error('Delete node error:', error)
        return false
      }
    },
    [closeTabsByPathPrefix, refreshTree, removeHistoryByPathPrefix, removeRecentByPathPrefix, rootPath]
  )

  const moveNode = useCallback(
    async (
      node: FileTreeTargetLike,
      targetDirectoryPath: string
    ): Promise<{ ok: true; path: string; name: string } | { ok: false; reason: FileTreeOperationFailureReason }> => {
      const moveValidation = validateMoveDestination(node, targetDirectoryPath)
      if (moveValidation) {
        return { ok: false, reason: moveValidation }
      }

      try {
        const assetRepairSnapshot =
          rootPath && node.type === 'dir'
            ? await getWorkspaceIndexSnapshot(rootPath).catch((error) => {
                console.error('Load workspace snapshot for asset propagation error:', error)
                return null
              })
            : null
        const [{ join }, { exists, rename }] = await Promise.all([
          import('@tauri-apps/api/path'),
          import('@tauri-apps/plugin-fs'),
        ])
        const nextPath = await join(targetDirectoryPath, getPathBaseName(node.path))
        if (nextPath === node.path) {
          return { ok: false, reason: 'same' }
        }

        if (await exists(nextPath)) {
          return { ok: false, reason: 'exists' }
        }

        await rename(node.path, nextPath)
        remapTabsForPathChange(node.path, nextPath)
        remapHistoryForPathChange(node.path, nextPath)
        remapRecentForPathChange(node.path, nextPath)
        if (node.type === 'dir') {
          await propagateWorkspaceAssetPathChange(node.path, nextPath, assetRepairSnapshot)
        }

        const currentTree = useFileTreeStore.getState().tree
        if (rootPath) {
          await refreshTree(rootPath, currentTree)
        }

        return { ok: true, path: nextPath, name: getPathBaseName(nextPath) }
      } catch (error) {
        console.error('Move node error:', error)
        return { ok: false, reason: 'unknown' }
      }
    },
    [propagateWorkspaceAssetPathChange, refreshTree, remapHistoryForPathChange, remapRecentForPathChange, remapTabsForPathChange, rootPath]
  )

  return {
    rootPath,
    tree,
    loading,
    openFolder,
    toggleDir,
    openFile,
    createFile,
    createFolder,
    renameNode,
    deleteNode,
    moveNode,
  }
}

function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/gu, '/')
}
