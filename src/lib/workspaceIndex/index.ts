import { buildWorkspaceIndexDocument, deriveWorkspaceDocumentName, isWorkspaceDocumentPath } from './analysis.ts'
import { readWorkspaceDocument, scanWorkspaceSnapshot, workspaceDocumentExists } from './scanner.ts'
import type {
  WorkspaceIndexDocument,
  WorkspaceIndexFile,
  WorkspaceIndexRuntime,
  WorkspaceIndexSnapshot,
  WorkspaceIndexStore,
} from './types.ts'

interface WorkspaceIndexCacheEntry {
  rootPath: string
  documentsByPath: Map<string, WorkspaceIndexDocument>
  filesByPath: Map<string, WorkspaceIndexFile>
  contentByPath: Map<string, string>
  contentInflightByPath: Map<string, Promise<string | null>>
  snapshot: WorkspaceIndexSnapshot | null
  revision: number
  lastBuiltRevision: number
  dirtyPaths: Set<string>
  needsFullRescan: boolean
  inflight: Promise<WorkspaceIndexSnapshot> | null
}

const MAX_INCREMENTAL_INVALIDATIONS = 64

const defaultWorkspaceIndexRuntime: WorkspaceIndexRuntime = {
  scanRoot: scanWorkspaceSnapshot,
  readDocument: readWorkspaceDocument,
  documentExists: workspaceDocumentExists,
}

export function createWorkspaceIndexStore(runtime: WorkspaceIndexRuntime): WorkspaceIndexStore {
  const cache = new Map<string, WorkspaceIndexCacheEntry>()

  function getEntry(rootPath: string): WorkspaceIndexCacheEntry {
    const normalizedRootPath = normalizeWorkspacePath(rootPath)
    const existing = cache.get(normalizedRootPath)
    if (existing) return existing

    const entry: WorkspaceIndexCacheEntry = {
      rootPath: normalizedRootPath,
      documentsByPath: new Map(),
      filesByPath: new Map(),
      contentByPath: new Map(),
      contentInflightByPath: new Map(),
      snapshot: null,
      revision: 0,
      lastBuiltRevision: -1,
      dirtyPaths: new Set(),
      needsFullRescan: true,
      inflight: null,
    }

    cache.set(normalizedRootPath, entry)
    return entry
  }

  function pruneDocumentContentCache(entry: WorkspaceIndexCacheEntry) {
    const validDocumentPaths = new Set(entry.documentsByPath.keys())

    entry.contentByPath = new Map(
      Array.from(entry.contentByPath.entries()).filter(([path]) => validDocumentPaths.has(path))
    )
    entry.contentInflightByPath = new Map(
      Array.from(entry.contentInflightByPath.entries()).filter(([path]) => validDocumentPaths.has(path))
    )
  }

  async function rebuildEntry(entry: WorkspaceIndexCacheEntry, revision: number): Promise<WorkspaceIndexSnapshot> {
    const snapshot = await runtime.scanRoot(entry.rootPath)
    entry.documentsByPath = new Map(
      snapshot.documents.map((document) => [normalizeWorkspacePath(document.path), document])
    )
    entry.filesByPath = new Map(
      snapshot.files.map((file) => [normalizeWorkspacePath(file.path), file])
    )
    pruneDocumentContentCache(entry)

    entry.snapshot = buildSnapshot(entry.rootPath, entry.documentsByPath, entry.filesByPath)
    entry.lastBuiltRevision = revision

    if (entry.revision === revision) {
      entry.dirtyPaths.clear()
      entry.needsFullRescan = false
    }

    return entry.snapshot
  }

  async function refreshDirtyPaths(entry: WorkspaceIndexCacheEntry, revision: number): Promise<WorkspaceIndexSnapshot> {
    if (
      entry.snapshot === null ||
      entry.needsFullRescan ||
      entry.dirtyPaths.size === 0 ||
      entry.dirtyPaths.size > MAX_INCREMENTAL_INVALIDATIONS
    ) {
      return rebuildEntry(entry, revision)
    }

    const dirtyPaths = Array.from(entry.dirtyPaths)
    for (const dirtyPath of dirtyPaths) {
      if (dirtyPath === entry.rootPath) {
        entry.needsFullRescan = true
        break
      }

      if (!isPathWithinRoot(dirtyPath, entry.rootPath)) continue

      let exists = false
      try {
        exists = await runtime.documentExists(dirtyPath)
      } catch {
        entry.needsFullRescan = true
        break
      }

      entry.contentByPath.delete(dirtyPath)
      entry.contentInflightByPath.delete(dirtyPath)

      if (!exists) {
        entry.documentsByPath.delete(dirtyPath)
        entry.filesByPath.delete(dirtyPath)
        continue
      }

      entry.filesByPath.set(dirtyPath, {
        path: dirtyPath,
        name: deriveWorkspaceDocumentName(dirtyPath),
      })

      if (!isWorkspaceDocumentPath(dirtyPath)) {
        entry.documentsByPath.delete(dirtyPath)
        continue
      }

      let content = ''
      try {
        content = await runtime.readDocument(dirtyPath)
      } catch {
        entry.needsFullRescan = true
        break
      }

      entry.documentsByPath.set(
        dirtyPath,
        buildWorkspaceIndexDocument(dirtyPath, content)
      )
    }

    if (entry.needsFullRescan) {
      return rebuildEntry(entry, revision)
    }

    const snapshot = buildSnapshot(entry.rootPath, entry.documentsByPath, entry.filesByPath)
    entry.snapshot = snapshot
    entry.lastBuiltRevision = revision
    pruneDocumentContentCache(entry)

    if (entry.revision === revision) {
      entry.dirtyPaths.clear()
    }

    return snapshot
  }

  async function getSnapshot(rootPath: string): Promise<WorkspaceIndexSnapshot> {
    const entry = getEntry(rootPath)
    const currentRevision = entry.revision
    if (
      entry.snapshot &&
      entry.lastBuiltRevision === currentRevision &&
      !entry.needsFullRescan &&
      entry.dirtyPaths.size === 0
    ) {
      return entry.snapshot
    }

    if (entry.inflight) return entry.inflight

    entry.inflight = (async () => {
      try {
        return await refreshDirtyPaths(entry, currentRevision)
      } finally {
        entry.inflight = null
      }
    })()

    return entry.inflight
  }

  async function getDocumentContent(rootPath: string, documentPath: string): Promise<string | null> {
    const entry = getEntry(rootPath)
    const normalizedDocumentPath = normalizeWorkspacePath(documentPath)
    if (!isPathWithinRoot(normalizedDocumentPath, entry.rootPath) || !isWorkspaceDocumentPath(normalizedDocumentPath)) {
      return null
    }

    await getSnapshot(rootPath)
    if (!entry.documentsByPath.has(normalizedDocumentPath)) return null

    const cached = entry.contentByPath.get(normalizedDocumentPath)
    if (cached !== undefined) return cached

    const inflight = entry.contentInflightByPath.get(normalizedDocumentPath)
    if (inflight) return inflight

    const revision = entry.revision
    const nextPromise = runtime.readDocument(normalizedDocumentPath)
      .then((content) => {
        if (
          entry.revision === revision &&
          !entry.needsFullRescan &&
          !entry.dirtyPaths.has(normalizedDocumentPath) &&
          entry.documentsByPath.has(normalizedDocumentPath)
        ) {
          entry.contentByPath.set(normalizedDocumentPath, content)
        }

        return content
      })
      .catch(() => null)
      .finally(() => {
        entry.contentInflightByPath.delete(normalizedDocumentPath)
      })

    entry.contentInflightByPath.set(normalizedDocumentPath, nextPromise)
    return nextPromise
  }

  return {
    getSnapshot,

    peekSnapshot(rootPath: string): WorkspaceIndexSnapshot | null {
      const normalizedRootPath = normalizeWorkspacePath(rootPath)
      return cache.get(normalizedRootPath)?.snapshot ?? null
    },

    getDocumentContent,

    invalidateRoot(rootPath: string): void {
      const entry = getEntry(rootPath)
      entry.revision += 1
      entry.needsFullRescan = true
      entry.contentByPath.clear()
      entry.contentInflightByPath.clear()
    },

    invalidatePaths(rootPath: string, paths: readonly string[]): void {
      const entry = getEntry(rootPath)
      entry.revision += 1

      if (paths.length === 0) {
        entry.needsFullRescan = true
        entry.contentByPath.clear()
        entry.contentInflightByPath.clear()
        return
      }

      for (const path of paths) {
        const normalizedPath = normalizeWorkspacePath(path)
        if (!normalizedPath || !isPathWithinRoot(normalizedPath, entry.rootPath)) continue
        if (normalizedPath === entry.rootPath) {
          entry.needsFullRescan = true
          entry.contentByPath.clear()
          entry.contentInflightByPath.clear()
          return
        }

        entry.dirtyPaths.add(normalizedPath)
        entry.contentByPath.delete(normalizedPath)
        entry.contentInflightByPath.delete(normalizedPath)
      }
    },

    clear(rootPath?: string): void {
      if (!rootPath) {
        cache.clear()
        return
      }

      cache.delete(normalizeWorkspacePath(rootPath))
    },
  }
}

const defaultWorkspaceIndexStore = createWorkspaceIndexStore(defaultWorkspaceIndexRuntime)

export async function getWorkspaceIndexSnapshot(rootPath: string): Promise<WorkspaceIndexSnapshot> {
  return defaultWorkspaceIndexStore.getSnapshot(rootPath)
}

export function peekWorkspaceIndexSnapshot(rootPath: string): WorkspaceIndexSnapshot | null {
  return defaultWorkspaceIndexStore.peekSnapshot(rootPath)
}

export async function getWorkspaceIndexDocumentContent(
  rootPath: string,
  documentPath: string
): Promise<string | null> {
  return defaultWorkspaceIndexStore.getDocumentContent(rootPath, documentPath)
}

export function invalidateWorkspaceIndexRoot(rootPath: string): void {
  defaultWorkspaceIndexStore.invalidateRoot(rootPath)
}

export function invalidateWorkspaceIndexPaths(rootPath: string, paths: readonly string[]): void {
  defaultWorkspaceIndexStore.invalidatePaths(rootPath, paths)
}

export function clearWorkspaceIndexCache(rootPath?: string): void {
  defaultWorkspaceIndexStore.clear(rootPath)
}

function buildSnapshot(
  rootPath: string,
  documentsByPath: Map<string, WorkspaceIndexDocument>,
  filesByPath: Map<string, WorkspaceIndexFile>
): WorkspaceIndexSnapshot {
  return {
    rootPath,
    generatedAt: Date.now(),
    documents: Array.from(documentsByPath.values()).sort((left, right) => left.path.localeCompare(right.path)),
    files: Array.from(filesByPath.values()).sort((left, right) => left.path.localeCompare(right.path)),
  }
}

function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/gu, '/')
}

function isPathWithinRoot(path: string, rootPath: string): boolean {
  return path === rootPath || path.startsWith(`${rootPath}/`)
}

export { deriveWorkspaceDocumentName }
export type {
  WorkspaceIndexAsset,
  WorkspaceIndexDiagnostic,
  WorkspaceIndexDocument,
  WorkspaceIndexFile,
  WorkspaceIndexFrontMatterSummary,
  WorkspaceIndexLink,
  WorkspaceIndexRuntime,
  WorkspaceIndexSnapshot,
  WorkspaceIndexStore,
} from './types.ts'
export type {
  WorkspaceAssetRepairCandidate,
  WorkspaceBacklink,
  WorkspaceDocumentLinkRepairCandidate,
  WorkspaceHealthFinding,
  WorkspaceOrphanedAsset,
  WorkspaceResolvedAssetReference,
  WorkspaceResolvedDocumentLink,
  WorkspaceUnlinkedMention,
} from './queries.ts'
export {
  getWorkspaceAssetReferences,
  getWorkspaceAssetRepairCandidates,
  getWorkspaceBacklinks,
  getWorkspaceBrokenDocumentLinks,
  getWorkspaceDocumentLinkRepairCandidates,
  getWorkspaceHealthFindings,
  getWorkspaceMissingAssetReferences,
  getWorkspaceOutgoingDocumentLinks,
  getWorkspaceOrphanedAssets,
  getWorkspaceUnlinkedMentions,
} from './queries.ts'
