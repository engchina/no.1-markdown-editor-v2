import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store/editor'
import { useFileTreeStore } from '../store/fileTree'
import { isSupportedDocumentName } from '../lib/fileTypes'
import { findDocumentMatches, type DocumentSearchMatch } from '../lib/search'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const MAX_RESULTS = 120

export interface WorkspaceSearchResult extends DocumentSearchMatch {
  id: string
  name: string
  path: string | null
  tabId: string | null
  source: 'tab' | 'workspace'
}

export function useWorkspaceSearch(query: string) {
  const tabs = useEditorStore((state) => state.tabs)
  const rootPath = useFileTreeStore((state) => state.rootPath)
  const deferredQuery = useDeferredValue(query.trim())
  const [results, setResults] = useState<WorkspaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!deferredQuery) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)

    void buildWorkspaceSearchResults({
      query: deferredQuery,
      tabs,
      rootPath,
      limit: MAX_RESULTS,
    })
      .then((nextResults) => {
        if (requestIdRef.current !== requestId) return
        setResults(nextResults)
      })
      .catch((error) => {
        console.error('Workspace search error:', error)
        if (requestIdRef.current !== requestId) return
        setResults([])
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setSearching(false)
      })
  }, [deferredQuery, rootPath, tabs])

  return { results, searching, rootPath, query: deferredQuery }
}

async function buildWorkspaceSearchResults({
  query,
  tabs,
  rootPath,
  limit,
}: {
  query: string
  tabs: ReturnType<typeof useEditorStore.getState>['tabs']
  rootPath: string | null
  limit: number
}): Promise<WorkspaceSearchResult[]> {
  const results = searchOpenTabs(tabs, query, limit)
  if (!isTauri || !rootPath || results.length >= limit) return results

  const openTabPaths = new Set(
    tabs
      .map((tab) => tab.path)
      .filter((path): path is string => typeof path === 'string' && path.length > 0)
  )

  const workspaceResults = await searchWorkspaceFiles(rootPath, query, limit - results.length, openTabPaths)
  return [...results, ...workspaceResults].slice(0, limit)
}

function searchOpenTabs(
  tabs: ReturnType<typeof useEditorStore.getState>['tabs'],
  query: string,
  limit: number
): WorkspaceSearchResult[] {
  const results: WorkspaceSearchResult[] = []

  for (const tab of tabs) {
    const matches = findDocumentMatches(tab.content, query, limit - results.length)
    for (const match of matches) {
      results.push({
        ...match,
        id: `tab:${tab.id}:${match.line}:${match.column}`,
        name: tab.name,
        path: tab.path,
        tabId: tab.id,
        source: 'tab',
      })
    }

    if (results.length >= limit) break
  }

  return results
}

async function searchWorkspaceFiles(
  rootPath: string,
  query: string,
  limit: number,
  excludedPaths: Set<string>
): Promise<WorkspaceSearchResult[]> {
  if (limit <= 0) return []

  const [{ readDir, readTextFile }, { join }] = await Promise.all([
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/api/path'),
  ])

  const results: WorkspaceSearchResult[] = []
  const queue = [rootPath]

  while (queue.length > 0 && results.length < limit) {
    const currentDir = queue.shift()
    if (!currentDir) break

    let entries: Awaited<ReturnType<typeof readDir>>
    try {
      entries = await readDir(currentDir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith('.')) continue

      const childPath = await join(currentDir, entry.name)
      if (entry.isDirectory) {
        queue.push(childPath)
        continue
      }

      if (!entry.isFile || !isSupportedDocumentName(entry.name) || excludedPaths.has(childPath)) {
        continue
      }

      let content = ''
      try {
        content = await readTextFile(childPath)
      } catch {
        continue
      }

      const matches = findDocumentMatches(content, query, limit - results.length)
      for (const match of matches) {
        results.push({
          ...match,
          id: `workspace:${childPath}:${match.line}:${match.column}`,
          name: entry.name,
          path: childPath,
          tabId: null,
          source: 'workspace',
        })
      }

      if (results.length >= limit) break
    }
  }

  return results
}
