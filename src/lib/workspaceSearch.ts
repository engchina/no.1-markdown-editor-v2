import { findDocumentMatches, type DocumentSearchMatch } from './search.ts'
import {
  getWorkspaceIndexDocumentContent,
  getWorkspaceIndexSnapshot,
  type WorkspaceIndexDocument,
  type WorkspaceIndexSnapshot,
} from './workspaceIndex/index.ts'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface WorkspaceSearchableTab {
  id: string
  name: string
  path: string | null
  content: string
}

export type WorkspaceDocumentMatchKind = 'exact-path' | 'exact-name' | 'path-suffix' | 'prefix' | 'contains'
export type WorkspaceDocumentConfidence = 'high' | 'medium' | 'low'

export interface WorkspaceSearchResult extends DocumentSearchMatch {
  id: string
  name: string
  path: string | null
  tabId: string | null
  source: 'tab' | 'workspace'
}

export interface WorkspaceDocumentReference {
  name: string
  path: string | null
  tabId: string | null
  source: 'tab' | 'workspace'
  content: string | null
  score: number
  matchKind: WorkspaceDocumentMatchKind
  confidence: WorkspaceDocumentConfidence
  ambiguous: boolean
}

export interface WorkspaceSearchRuntime {
  workspaceEnabled: boolean
  getSnapshot: (rootPath: string) => Promise<WorkspaceIndexSnapshot>
  getDocumentContent: (rootPath: string, documentPath: string) => Promise<string | null>
}

interface WorkspaceDocumentCandidate {
  name: string
  path: string | null
  tabId: string | null
  source: 'tab' | 'workspace'
  content?: string
  score: number
  matchKind: WorkspaceDocumentMatchKind
  confidence?: WorkspaceDocumentConfidence
  ambiguous?: boolean
}

const defaultWorkspaceSearchRuntime: WorkspaceSearchRuntime = {
  workspaceEnabled: isTauri,
  getSnapshot: getWorkspaceIndexSnapshot,
  getDocumentContent: getWorkspaceIndexDocumentContent,
}

export async function buildWorkspaceSearchResults({
  query,
  tabs,
  rootPath,
  limit,
  runtime = defaultWorkspaceSearchRuntime,
}: {
  query: string
  tabs: WorkspaceSearchableTab[]
  rootPath: string | null
  limit: number
  runtime?: WorkspaceSearchRuntime
}): Promise<WorkspaceSearchResult[]> {
  const results = searchOpenTabs(tabs, query, limit)
  if (!runtime.workspaceEnabled || !rootPath || results.length >= limit) return results

  const openTabPaths = new Set(
    tabs
      .map((tab) => normalizeWorkspacePath(tab.path))
      .filter((path): path is string => typeof path === 'string' && path.length > 0)
  )

  const snapshot = await runtime.getSnapshot(rootPath)
  const workspaceResults = await searchWorkspaceIndexDocuments(
    snapshot.documents,
    query,
    limit - results.length,
    openTabPaths,
    {
      rootPath,
      runtime,
    }
  )

  return [...results, ...workspaceResults].slice(0, limit)
}

export function searchOpenTabs(
  tabs: WorkspaceSearchableTab[],
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

export async function findWorkspaceDocumentReference({
  query,
  tabs,
  rootPath,
  includeContent = false,
  runtime = defaultWorkspaceSearchRuntime,
}: {
  query: string
  tabs: WorkspaceSearchableTab[]
  rootPath: string | null
  includeContent?: boolean
  runtime?: WorkspaceSearchRuntime
}): Promise<WorkspaceDocumentReference | null> {
  const references = await findWorkspaceDocumentReferences({
    query,
    tabs,
    rootPath,
    limit: 1,
    includeContent,
    runtime,
  })

  return references[0] ?? null
}

export async function findWorkspaceDocumentReferences({
  query,
  tabs,
  rootPath,
  limit,
  excludePaths = [],
  includeContent = false,
  runtime = defaultWorkspaceSearchRuntime,
}: {
  query: string
  tabs: WorkspaceSearchableTab[]
  rootPath: string | null
  limit: number
  excludePaths?: string[]
  includeContent?: boolean
  runtime?: WorkspaceSearchRuntime
}): Promise<WorkspaceDocumentReference[]> {
  const normalizedQuery = normalizeLookupValue(query)
  if (!normalizedQuery || limit <= 0) return []

  const excluded = new Set(excludePaths.map(normalizeLookupValue))
  const openTabPaths = new Set(
    tabs
      .map((tab) => normalizeWorkspacePath(tab.path))
      .filter((path): path is string => typeof path === 'string' && path.length > 0)
  )
  const openCandidates = findOpenTabDocumentCandidates(tabs, normalizedQuery, excluded)
  const workspaceCandidates =
    runtime.workspaceEnabled && rootPath
      ? await findWorkspaceIndexDocumentCandidates(rootPath, normalizedQuery, openTabPaths, excluded, limit * 4, runtime)
      : []

  const mergedCandidates = annotateWorkspaceDocumentCandidates(
    mergeWorkspaceDocumentCandidates([...openCandidates, ...workspaceCandidates])
  ).slice(0, limit)

  if (mergedCandidates.length === 0) return []

  const references = await Promise.all(
    mergedCandidates.map(async (candidate) => {
      if (candidate.source === 'tab') {
        return {
          name: candidate.name,
          path: candidate.path,
          tabId: candidate.tabId,
          source: candidate.source,
          content: includeContent ? candidate.content ?? null : null,
          score: candidate.score,
          matchKind: candidate.matchKind,
          confidence: candidate.confidence ?? 'low',
          ambiguous: candidate.ambiguous === true,
        } satisfies WorkspaceDocumentReference
      }

      if (!candidate.path || !rootPath) return null
      const content = includeContent
        ? await runtime.getDocumentContent(rootPath, candidate.path)
        : null

      return {
        name: candidate.name,
        path: candidate.path,
        tabId: null,
        source: candidate.source,
        content,
        score: candidate.score,
        matchKind: candidate.matchKind,
        confidence: candidate.confidence ?? 'low',
        ambiguous: candidate.ambiguous === true,
      } satisfies WorkspaceDocumentReference
    })
  )

  const resolvedReferences: WorkspaceDocumentReference[] = []
  for (const reference of references) {
    if (reference) resolvedReferences.push(reference)
  }

  return resolvedReferences
}

async function searchWorkspaceIndexDocuments(
  documents: readonly WorkspaceIndexDocument[],
  query: string,
  limit: number,
  excludedPaths: Set<string>,
  options: {
    rootPath: string
    runtime: WorkspaceSearchRuntime
  }
): Promise<WorkspaceSearchResult[]> {
  if (limit <= 0) return []

  const results: WorkspaceSearchResult[] = []

  for (const document of documents) {
    const normalizedPath = normalizeWorkspacePath(document.path)
    if (excludedPaths.has(normalizedPath)) continue

    const content = await options.runtime.getDocumentContent(options.rootPath, document.path)
    if (!content) continue

    const matches = findDocumentMatches(content, query, limit - results.length)
    for (const match of matches) {
      results.push({
        ...match,
        id: `workspace:${document.path}:${match.line}:${match.column}`,
        name: document.name,
        path: document.path,
        tabId: null,
        source: 'workspace',
      })
    }

    if (results.length >= limit) break
  }

  return results
}

function findOpenTabDocumentCandidates(
  tabs: WorkspaceSearchableTab[],
  normalizedQuery: string,
  excluded: Set<string>
): WorkspaceDocumentCandidate[] {
  const candidates: WorkspaceDocumentCandidate[] = []

  for (const tab of tabs) {
    const exclusionKey = normalizeLookupValue(tab.path ?? tab.name)
    if (excluded.has(exclusionKey)) continue

    const match = scoreDocumentQuery(tab.name, tab.path, normalizedQuery)
    if (!match) continue

    candidates.push({
      name: tab.name,
      path: tab.path,
      tabId: tab.id,
      source: 'tab',
      content: tab.content,
      score: match.score,
      matchKind: match.matchKind,
    })
  }

  return candidates
}

async function findWorkspaceIndexDocumentCandidates(
  rootPath: string,
  normalizedQuery: string,
  excludedOpenTabPaths: Set<string>,
  excluded: Set<string>,
  limit: number,
  runtime: WorkspaceSearchRuntime
): Promise<WorkspaceDocumentCandidate[]> {
  if (limit <= 0) return []
  const snapshot = await runtime.getSnapshot(rootPath)
  const candidates: WorkspaceDocumentCandidate[] = []

  for (const document of snapshot.documents) {
    const normalizedPath = normalizeWorkspacePath(document.path)
    if (excludedOpenTabPaths.has(normalizedPath)) continue

    const exclusionKey = normalizeLookupValue(document.path)
    if (excluded.has(exclusionKey)) continue

    const match = scoreDocumentQuery(document.name, document.path, normalizedQuery)
    if (!match) continue

    candidates.push({
      name: document.name,
      path: document.path,
      tabId: null,
      source: 'workspace',
      score: match.score,
      matchKind: match.matchKind,
    })
  }

  return mergeWorkspaceDocumentCandidates(candidates).slice(0, limit)
}

function mergeWorkspaceDocumentCandidates(
  candidates: WorkspaceDocumentCandidate[]
): WorkspaceDocumentCandidate[] {
  const merged = new Map<string, WorkspaceDocumentCandidate>()

  for (const candidate of candidates) {
    const key = candidate.path ? `path:${normalizeLookupValue(candidate.path)}` : `tab:${candidate.tabId ?? candidate.name}`
    const existing = merged.get(key)
    if (!existing || candidate.score > existing.score) {
      merged.set(key, candidate)
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score
    return (left.path ?? left.name).localeCompare(right.path ?? right.name)
  })
}

function annotateWorkspaceDocumentCandidates(
  candidates: WorkspaceDocumentCandidate[]
) {
  return candidates.map((candidate, index) => {
    const ambiguous = candidates.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.score === candidate.score &&
        other.matchKind === candidate.matchKind
    )

    return {
      ...candidate,
      ambiguous,
      confidence: resolveWorkspaceDocumentConfidence(candidate.matchKind, candidate.score, ambiguous),
    }
  })
}

function scoreDocumentQuery(
  name: string,
  path: string | null,
  normalizedQuery: string
): { score: number; matchKind: WorkspaceDocumentMatchKind } | null {
  const normalizedName = normalizeLookupValue(name)
  const normalizedPath = normalizeLookupValue(path ?? '')
  const normalizedStem = stripMarkdownExtension(normalizedName)
  const normalizedBaseName = normalizedPath.split('/').pop() ?? normalizedName
  const normalizedBaseStem = stripMarkdownExtension(normalizedBaseName)

  if (normalizedPath === normalizedQuery) return { score: Number.POSITIVE_INFINITY, matchKind: 'exact-path' }
  if (normalizedName === normalizedQuery) return { score: Number.POSITIVE_INFINITY, matchKind: 'exact-name' }
  if (normalizedBaseName === normalizedQuery || normalizedBaseStem === normalizedQuery || normalizedStem === normalizedQuery) {
    return { score: 1200, matchKind: 'exact-name' }
  }
  if (normalizedPath.endsWith(`/${normalizedQuery}`)) return { score: 1100, matchKind: 'path-suffix' }
  if (normalizedBaseName.startsWith(normalizedQuery) || normalizedBaseStem.startsWith(normalizedQuery)) {
    return { score: 900, matchKind: 'prefix' }
  }
  if (normalizedName.includes(normalizedQuery) || normalizedStem.includes(normalizedQuery)) {
    return { score: 720, matchKind: 'contains' }
  }
  if (normalizedPath.includes(normalizedQuery)) return { score: 560, matchKind: 'contains' }

  return null
}

function resolveWorkspaceDocumentConfidence(
  matchKind: WorkspaceDocumentMatchKind,
  score: number,
  ambiguous: boolean
): WorkspaceDocumentConfidence {
  let confidence: WorkspaceDocumentConfidence

  switch (matchKind) {
    case 'exact-path':
    case 'exact-name':
    case 'path-suffix':
      confidence = 'high'
      break
    case 'prefix':
      confidence = 'medium'
      break
    case 'contains':
    default:
      confidence = score >= 720 ? 'medium' : 'low'
      break
  }

  if (!ambiguous) return confidence
  if (confidence === 'high') return 'medium'
  return 'low'
}

function normalizeLookupValue(value: string): string {
  return value
    .trim()
    .replace(/\\/gu, '/')
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .toLowerCase()
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.(md|markdown|mdx|txt)$/iu, '')
}

function normalizeWorkspacePath(path: string): string
function normalizeWorkspacePath(path: string | null): string | null
function normalizeWorkspacePath(path: string | null): string | null {
  return typeof path === 'string' && path.length > 0 ? path.replace(/\\/gu, '/') : null
}
