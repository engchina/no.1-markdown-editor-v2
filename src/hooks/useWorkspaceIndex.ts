import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useFileTreeStore } from '../store/fileTree'
import { buildWorkspaceIndexDocument } from '../lib/workspaceIndex/analysis.ts'
import {
  getWorkspaceIndexSnapshot,
  peekWorkspaceIndexSnapshot,
  type WorkspaceIndexDocument,
  type WorkspaceIndexFile,
  type WorkspaceIndexSnapshot,
} from '../lib/workspaceIndex/index.ts'

export function useWorkspaceIndex(activeDocument?: {
  path: string | null
  content: string
}): {
  snapshot: WorkspaceIndexSnapshot | null
  loading: boolean
  rootPath: string | null
} {
  const rootPath = useFileTreeStore((state) => state.rootPath)
  const tree = useFileTreeStore((state) => state.tree)
  const deferredRootPath = useDeferredValue(rootPath)
  const [baseSnapshot, setBaseSnapshot] = useState<WorkspaceIndexSnapshot | null>(() =>
    deferredRootPath ? peekWorkspaceIndexSnapshot(deferredRootPath) : null
  )
  const [loading, setLoading] = useState(() => deferredRootPath ? peekWorkspaceIndexSnapshot(deferredRootPath) === null : false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!deferredRootPath) {
      setBaseSnapshot(null)
      setLoading(false)
      return
    }

    const cachedSnapshot = peekWorkspaceIndexSnapshot(deferredRootPath)
    if (cachedSnapshot) {
      setBaseSnapshot(cachedSnapshot)
      setLoading(false)
    } else {
      setBaseSnapshot(null)
      setLoading(true)
    }

    void getWorkspaceIndexSnapshot(deferredRootPath)
      .then((snapshot) => {
        if (requestIdRef.current !== requestId) return
        setBaseSnapshot(snapshot)
      })
      .catch((error) => {
        console.error('Workspace index load error:', error)
        if (requestIdRef.current !== requestId) return
        setBaseSnapshot(null)
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false)
      })
  }, [deferredRootPath, tree])

  const snapshot = useMemo(() => {
    if (!baseSnapshot) return null

    const root = deferredRootPath?.replace(/\\/gu, '/') ?? null
    if (root && baseSnapshot.rootPath.replace(/\\/gu, '/') !== root) {
      return null
    }

    const activePath = activeDocument?.path?.replace(/\\/gu, '/') ?? null
    if (!activePath || !root || !isPathWithinRoot(activePath, root)) return baseSnapshot

    const nextDocument = buildWorkspaceIndexDocument(activePath, activeDocument?.content ?? '')
    const nextDocuments: WorkspaceIndexDocument[] = [
      ...baseSnapshot.documents.filter((document) => document.path !== activePath),
      nextDocument,
    ].sort((left, right) => left.path.localeCompare(right.path))

    const nextFiles: WorkspaceIndexFile[] =
      baseSnapshot.files.some((file) => file.path === activePath)
        ? baseSnapshot.files
        : [...baseSnapshot.files, { path: activePath, name: nextDocument.name }].sort((left, right) =>
            left.path.localeCompare(right.path)
          )

    return {
      ...baseSnapshot,
      documents: nextDocuments,
      files: nextFiles,
    }
  }, [activeDocument?.content, activeDocument?.path, baseSnapshot, deferredRootPath])

  return {
    snapshot,
    loading,
    rootPath: deferredRootPath,
  }
}

function isPathWithinRoot(path: string, rootPath: string): boolean {
  return path === rootPath || path.startsWith(`${rootPath}/`)
}
