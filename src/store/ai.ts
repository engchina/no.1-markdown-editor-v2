import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createDefaultAIHistoryCollectionRetrievalPolicy } from '../lib/ai/historyCollectionPolicy.ts'
import {
  createDefaultAIHistorySavedViewRetrievalPreset,
  sanitizeAIHistorySavedViewAutomationMode,
} from '../lib/ai/historySavedViewPreset.ts'
import { pathMatchesPrefix, remapPathPrefix } from '../lib/fileTreePaths.ts'
import { getAIDocumentThreadKey } from '../lib/ai/thread.ts'
import type {
  AIApplySnapshot,
  AIComposerSource,
  AIComposerState,
  AIContextPacket,
  AIHistoryCollection,
  AIHistoryCollectionRetrievalPolicy,
  AIDocumentSessionHistoryEntry,
  AIHistoryEntryRef,
  AIHistoryArchive,
  AIHistoryProviderRerankBudget,
  AIHistoryProviderRerankAuditEntry,
  AIHistoryRetentionPreset,
  AIHistorySavedView,
  AIHistorySavedViewRetrievalPreset,
  AIHistorySavedViewStatusFilter,
  AIIntent,
  AIOutputTarget,
  AIProvenanceMark,
  AIRequestState,
  AIScope,
  AIWorkspaceExecutionHistoryRecord,
  AIWorkspaceExecutionHistoryTaskCompletionSource,
  AIWorkspaceExecutionHistoryTaskStatus,
} from '../lib/ai/types.ts'

interface AIStoreState {
  composer: AIComposerState
  historyRetentionPreset: AIHistoryRetentionPreset
  threadIdsByDocument: Record<string, string>
  sessionHistoryByDocument: Record<string, AIDocumentSessionHistoryEntry[]>
  historyCollections: AIHistoryCollection[]
  historySavedViews: AIHistorySavedView[]
  historyProviderRerankAudit: AIHistoryProviderRerankAuditEntry[]
  provenanceMarksByTab: Record<string, AIProvenanceMark[]>
  openComposer: (args?: Partial<AIComposerState>) => void
  closeComposer: () => void
  setIntent: (intent: AIIntent) => void
  setScope: (scope: AIScope) => void
  setOutputTarget: (outputTarget: AIOutputTarget) => void
  setPrompt: (prompt: string) => void
  setContext: (context: AIContextPacket | null) => void
  setSource: (source: AIComposerSource) => void
  setDraftText: (draftText: string) => void
  appendDraftText: (chunk: string) => void
  setExplanationText: (explanationText: string) => void
  setDiffBaseText: (diffBaseText: string | null) => void
  setThreadId: (threadId: string | null) => void
  setSourceSnapshot: (sourceSnapshot: AIApplySnapshot | null) => void
  setRequestState: (requestState: AIRequestState) => void
  startRequest: () => void
  finishRequest: () => void
  failRequest: (errorMessage: string) => void
  resetDraftState: () => void
  setHistoryRetentionPreset: (preset: AIHistoryRetentionPreset) => void
  ensureThreadId: (tabId: string, tabPath: string | null) => string
  bindThreadId: (tabId: string, tabPath: string | null, threadId: string) => void
  getThreadId: (tabId: string, tabPath: string | null) => string | null
  rekeyDocumentHistory: (tabId: string, previousPath: string | null, nextPath: string | null) => void
  remapHistoryForPathChange: (oldPath: string, newPath: string) => void
  removeHistoryByPathPrefix: (pathPrefix: string) => void
  startSessionHistory: (args: {
    tabId: string
    tabPath: string | null
    documentName: string
    source: AIComposerSource
    intent: AIIntent
    scope: AIScope
    outputTarget: AIOutputTarget
    prompt: string
    attachmentCount: number
    threadId?: string | null
  }) => { entryId: string; threadId: string }
  updateSessionHistory: (
    tabId: string,
    tabPath: string | null,
    entryId: string,
    patch: Partial<
      Pick<
        AIDocumentSessionHistoryEntry,
        'status' | 'resultPreview' | 'errorMessage' | 'updatedAt' | 'pinned' | 'workspaceExecution'
      >
    >
  ) => void
  getSessionHistory: (tabId: string, tabPath: string | null) => AIDocumentSessionHistoryEntry[]
  toggleSessionHistoryPin: (tabId: string, tabPath: string | null, entryId: string) => void
  removeSessionHistoryEntry: (tabId: string, tabPath: string | null, entryId: string) => void
  clearSessionHistory: (tabId: string, tabPath: string | null, options?: { preservePinned?: boolean }) => void
  clearAllSessionHistory: (options?: { preservePinned?: boolean }) => void
  createHistoryCollection: (
    name: string,
    entryRefs: AIHistoryEntryRef[],
    options?: { retrievalPolicy?: Partial<AIHistoryCollectionRetrievalPolicy> }
  ) => string | null
  updateHistoryCollectionPolicy: (
    collectionId: string,
    policy: Partial<AIHistoryCollectionRetrievalPolicy>
  ) => void
  deleteHistoryCollection: (collectionId: string) => void
  createHistorySavedView: (
    name: string,
    options: {
      query: string
      collectionId: string | null
      retrievalPreset?: Partial<AIHistorySavedViewRetrievalPreset>
    }
  ) => string | null
  updateHistorySavedViewRetrievalPreset: (
    viewId: string,
    preset: Partial<AIHistorySavedViewRetrievalPreset>
  ) => void
  deleteHistorySavedView: (viewId: string) => void
  addHistoryProviderRerankAudit: (entry: Omit<AIHistoryProviderRerankAuditEntry, 'id' | 'createdAt'>) => string
  exportHistoryArchive: () => AIHistoryArchive
  importHistoryArchive: (
    value: unknown,
    options?: { mode?: 'merge' | 'replace' }
  ) => { documentCount: number; entryCount: number; auditCount: number }
  setProvenanceMarks: (tabId: string, marks: AIProvenanceMark[]) => void
  addProvenanceMark: (tabId: string, mark: AIProvenanceMark) => void
  getProvenanceMarks: (tabId: string) => AIProvenanceMark[]
  clearProvenanceMarks: (tabId: string) => void
}

const AI_STORE_STORAGE_KEY = 'ai-session-history'
const MAX_HISTORY_COLLECTIONS = 32
const MAX_HISTORY_SAVED_VIEWS = 32
const MAX_HISTORY_PROVIDER_RERANK_AUDIT = 50

const HISTORY_RETENTION_LIMITS: Record<
  AIHistoryRetentionPreset,
  {
    maxUnpinnedPerDocument: number
    maxUnpinnedDocuments: number
  }
> = {
  compact: {
    maxUnpinnedPerDocument: 5,
    maxUnpinnedDocuments: 20,
  },
  standard: {
    maxUnpinnedPerDocument: 10,
    maxUnpinnedDocuments: 40,
  },
  extended: {
    maxUnpinnedPerDocument: 20,
    maxUnpinnedDocuments: 80,
  },
}

function createNoopStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    get length() {
      return 0
    },
  }
}

function getAIStoreStorage() {
  if (typeof localStorage !== 'undefined') return localStorage
  return createNoopStorage()
}

function createAIThreadId() {
  return `thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createAISessionHistoryEntryId() {
  return `ai-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createAIHistoryCollectionId() {
  return `ai-collection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createAIHistorySavedViewId() {
  return `ai-view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createAIHistoryProviderRerankAuditId() {
  return `ai-history-audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeHistoryRetentionPreset(value: unknown): AIHistoryRetentionPreset {
  switch (value) {
    case 'compact':
    case 'extended':
      return value
    case 'standard':
    default:
      return 'standard'
  }
}

function sanitizeHistoryProviderRerankBudget(value: unknown): 'conservative' | 'balanced' | 'deep' {
  switch (value) {
    case 'conservative':
    case 'deep':
      return value
    case 'balanced':
    default:
      return 'balanced'
  }
}

function sanitizeOptionalHistoryProviderRerankBudget(value: unknown): AIHistoryProviderRerankBudget | null {
  switch (value) {
    case 'conservative':
    case 'balanced':
    case 'deep':
      return value
    default:
      return null
  }
}

function sanitizeHistoryCollectionProviderMode(
  value: unknown
): AIHistoryCollectionRetrievalPolicy['providerMode'] {
  switch (value) {
    case 'local-only':
    case 'allow-provider':
      return value
    case 'inherit':
    default:
      return 'inherit'
  }
}

function sanitizeHistoryCollectionRetrievalPolicy(value: unknown): AIHistoryCollectionRetrievalPolicy {
  if (!value || typeof value !== 'object') return createDefaultAIHistoryCollectionRetrievalPolicy()

  const candidate = value as Partial<AIHistoryCollectionRetrievalPolicy>
  return {
    providerMode: sanitizeHistoryCollectionProviderMode(candidate.providerMode),
    providerBudgetOverride: sanitizeOptionalHistoryProviderRerankBudget(candidate.providerBudgetOverride),
  }
}

function sanitizeHistorySavedViewStatusFilter(value: unknown): AIHistorySavedViewStatusFilter {
  switch (value) {
    case 'streaming':
    case 'done':
    case 'error':
    case 'canceled':
      return value
    case 'all':
    default:
      return 'all'
  }
}

function sanitizeHistorySavedViewRetrievalPreset(value: unknown): AIHistorySavedViewRetrievalPreset {
  if (!value || typeof value !== 'object') return createDefaultAIHistorySavedViewRetrievalPreset()

  const candidate = value as Partial<AIHistorySavedViewRetrievalPreset>
  return {
    statusFilter: sanitizeHistorySavedViewStatusFilter(candidate.statusFilter),
    pinnedOnly: candidate.pinnedOnly === true,
    providerBudgetOverride: sanitizeOptionalHistoryProviderRerankBudget(candidate.providerBudgetOverride),
    automationMode: sanitizeAIHistorySavedViewAutomationMode(candidate.automationMode),
  }
}

function sanitizeWorkspaceExecutionHistoryTaskStatus(
  value: unknown
): AIWorkspaceExecutionHistoryTaskStatus {
  switch (value) {
    case 'waiting':
    case 'running':
    case 'done':
    case 'error':
    case 'canceled':
      return value
    case 'idle':
    default:
      return 'idle'
  }
}

function sanitizeWorkspaceExecutionHistoryTaskCompletionSource(
  value: unknown
): AIWorkspaceExecutionHistoryTaskCompletionSource | null {
  switch (value) {
    case 'manual-apply':
    case 'manual-open-draft':
    case 'agent':
      return value
    default:
      return null
  }
}

function sanitizeWorkspaceExecutionHistoryRecord(
  value: unknown
): AIWorkspaceExecutionHistoryRecord | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<AIWorkspaceExecutionHistoryRecord>
  if (
    typeof candidate.taskCount !== 'number' ||
    typeof candidate.completedCount !== 'number' ||
    typeof candidate.failedCount !== 'number' ||
    typeof candidate.waitingCount !== 'number' ||
    typeof candidate.updatedAt !== 'number' ||
    !Array.isArray(candidate.tasks)
  ) {
    return null
  }

  const tasks = candidate.tasks
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const task = item as Partial<AIWorkspaceExecutionHistoryRecord['tasks'][number]>
      if (
        typeof task.taskId !== 'string' ||
        typeof task.action !== 'string' ||
        typeof task.title !== 'string' ||
        typeof task.target !== 'string'
      ) {
        return null
      }

      return {
        taskId: task.taskId,
        action: task.action === 'create-note' ? 'create-note' : 'update-note',
        title: task.title,
        target: task.target,
        phase: typeof task.phase === 'string' ? task.phase : null,
        status: sanitizeWorkspaceExecutionHistoryTaskStatus(task.status),
        message: typeof task.message === 'string' ? task.message : null,
        completionSource: sanitizeWorkspaceExecutionHistoryTaskCompletionSource(task.completionSource),
        completionAt: typeof task.completionAt === 'number' ? task.completionAt : null,
        originRunId: typeof task.originRunId === 'number' ? task.originRunId : null,
      } satisfies AIWorkspaceExecutionHistoryRecord['tasks'][number]
    })
    .filter((task): task is AIWorkspaceExecutionHistoryRecord['tasks'][number] => task !== null)

  return {
    summary: typeof candidate.summary === 'string' ? candidate.summary : null,
    taskCount: Math.max(0, Math.round(candidate.taskCount)),
    completedCount: Math.max(0, Math.round(candidate.completedCount)),
    failedCount: Math.max(0, Math.round(candidate.failedCount)),
    waitingCount: Math.max(0, Math.round(candidate.waitingCount)),
    updatedAt: candidate.updatedAt,
    tasks,
  }
}

function sanitizeSessionHistoryEntry(entry: unknown): AIDocumentSessionHistoryEntry | null {
  if (!entry || typeof entry !== 'object') return null

  const candidate = entry as Partial<AIDocumentSessionHistoryEntry>
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.threadId !== 'string' ||
    typeof candidate.source !== 'string' ||
    typeof candidate.intent !== 'string' ||
    typeof candidate.scope !== 'string' ||
    typeof candidate.outputTarget !== 'string' ||
    typeof candidate.prompt !== 'string' ||
    typeof candidate.documentName !== 'string' ||
    typeof candidate.status !== 'string' ||
    typeof candidate.createdAt !== 'number' ||
    typeof candidate.updatedAt !== 'number'
  ) {
    return null
  }

  return {
    id: candidate.id,
    threadId: candidate.threadId,
    pinned: candidate.pinned === true,
    source: candidate.source as AIDocumentSessionHistoryEntry['source'],
    intent: candidate.intent as AIDocumentSessionHistoryEntry['intent'],
    scope: candidate.scope as AIDocumentSessionHistoryEntry['scope'],
    outputTarget: candidate.outputTarget as AIDocumentSessionHistoryEntry['outputTarget'],
    prompt: candidate.prompt,
    resultPreview: typeof candidate.resultPreview === 'string' ? candidate.resultPreview : null,
    errorMessage: typeof candidate.errorMessage === 'string' ? candidate.errorMessage : null,
    status: candidate.status as AIDocumentSessionHistoryEntry['status'],
    documentName: candidate.documentName,
    attachmentCount: typeof candidate.attachmentCount === 'number' ? candidate.attachmentCount : 0,
    workspaceExecution: sanitizeWorkspaceExecutionHistoryRecord(candidate.workspaceExecution),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  }
}

function sortSessionHistoryEntries(entries: readonly AIDocumentSessionHistoryEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
    return right.updatedAt - left.updatedAt
  })
}

function dedupeSessionHistoryEntries(entries: readonly AIDocumentSessionHistoryEntry[]) {
  const seen = new Set<string>()
  const nextEntries: AIDocumentSessionHistoryEntry[] = []

  for (const entry of entries) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    nextEntries.push(entry)
  }

  return nextEntries
}

function normalizeSessionHistoryEntries(
  entries: readonly AIDocumentSessionHistoryEntry[],
  preset: AIHistoryRetentionPreset
) {
  const deduped = dedupeSessionHistoryEntries(sortSessionHistoryEntries(entries))
  const pinnedEntries = deduped.filter((entry) => entry.pinned)
  const unpinnedEntries = deduped
    .filter((entry) => !entry.pinned)
    .slice(0, HISTORY_RETENTION_LIMITS[preset].maxUnpinnedPerDocument)

  return [...pinnedEntries, ...unpinnedEntries]
}

function normalizeSessionHistoryByDocument(
  value: unknown,
  preset: AIHistoryRetentionPreset
): Record<string, AIDocumentSessionHistoryEntry[]> {
  if (!value || typeof value !== 'object') return {}

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([documentKey, items]) => {
      if (!Array.isArray(items)) return null
      const normalized = normalizeSessionHistoryEntries(
        items
          .map((item) => sanitizeSessionHistoryEntry(item))
          .filter((item): item is AIDocumentSessionHistoryEntry => item !== null),
        preset
      )
      if (normalized.length === 0) return null
      return [documentKey, normalized] as const
    })
    .filter((entry): entry is readonly [string, AIDocumentSessionHistoryEntry[]] => entry !== null)
    .sort((left, right) => {
      const leftPinned = left[1].some((entry) => entry.pinned)
      const rightPinned = right[1].some((entry) => entry.pinned)
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1
      return (right[1][0]?.updatedAt ?? 0) - (left[1][0]?.updatedAt ?? 0)
    })

  const pinnedDocuments = entries.filter(([, items]) => items.some((entry) => entry.pinned))
  const unpinnedDocuments = entries
    .filter(([, items]) => !items.some((entry) => entry.pinned))
    .slice(0, HISTORY_RETENTION_LIMITS[preset].maxUnpinnedDocuments)

  return Object.fromEntries([...pinnedDocuments, ...unpinnedDocuments])
}

function filterThreadIdsByDocument(
  threadIdsByDocument: Record<string, string>,
  sessionHistoryByDocument: Record<string, AIDocumentSessionHistoryEntry[]>
) {
  const validDocumentKeys = new Set(Object.keys(sessionHistoryByDocument))
  return Object.fromEntries(
    Object.entries(threadIdsByDocument).filter(([documentKey, threadId]) =>
      validDocumentKeys.has(documentKey) && typeof threadId === 'string' && threadId.length > 0
    )
  )
}

function mergeSessionHistoryByDocument(
  current: Record<string, AIDocumentSessionHistoryEntry[]>,
  documentKey: string,
  entries: readonly AIDocumentSessionHistoryEntry[],
  preset: AIHistoryRetentionPreset
) {
  const nextHistory = normalizeSessionHistoryByDocument({
    ...current,
    [documentKey]: normalizeSessionHistoryEntries(entries, preset),
  }, preset)

  return nextHistory
}

function sanitizeHistoryArchive(value: unknown): AIHistoryArchive | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<AIHistoryArchive>
  if (candidate.version !== 1 || typeof candidate.exportedAt !== 'number') return null

  const historyRetentionPreset = sanitizeHistoryRetentionPreset(candidate.historyRetentionPreset)
  const sessionHistoryByDocument = normalizeSessionHistoryByDocument(
    candidate.sessionHistoryByDocument,
    historyRetentionPreset
  )
  const threadIdsByDocument = filterThreadIdsByDocument(candidate.threadIdsByDocument ?? {}, sessionHistoryByDocument)
  const historyCollections = normalizeHistoryCollections(candidate.historyCollections, sessionHistoryByDocument)
  const historySavedViews = normalizeHistorySavedViews(candidate.historySavedViews, historyCollections)
  const historyProviderRerankAudit = normalizeHistoryProviderRerankAudit(candidate.historyProviderRerankAudit)

  return {
    version: 1,
    exportedAt: candidate.exportedAt,
    historyRetentionPreset,
    threadIdsByDocument,
    sessionHistoryByDocument,
    historyCollections,
    historySavedViews,
    historyProviderRerankAudit,
  }
}

function createHistoryEntryRefKey(ref: AIHistoryEntryRef) {
  return `${ref.documentKey}::${ref.entryId}`
}

function createAvailableHistoryEntryKeySet(
  sessionHistoryByDocument: Record<string, AIDocumentSessionHistoryEntry[]>
) {
  const available = new Set<string>()
  for (const [documentKey, entries] of Object.entries(sessionHistoryByDocument)) {
    for (const entry of entries) {
      available.add(createHistoryEntryRefKey({ documentKey, entryId: entry.id }))
    }
  }
  return available
}

function normalizeHistoryEntryRefs(
  refs: readonly AIHistoryEntryRef[],
  availableKeys: ReadonlySet<string>
) {
  const seen = new Set<string>()
  const nextRefs: AIHistoryEntryRef[] = []

  for (const ref of refs) {
    const documentKey = typeof ref.documentKey === 'string' ? ref.documentKey : ''
    const entryId = typeof ref.entryId === 'string' ? ref.entryId : ''
    if (!documentKey || !entryId) continue

    const key = createHistoryEntryRefKey({ documentKey, entryId })
    if (!availableKeys.has(key) || seen.has(key)) continue
    seen.add(key)
    nextRefs.push({ documentKey, entryId })
  }

  return nextRefs
}

function normalizeHistoryCollections(
  value: unknown,
  sessionHistoryByDocument: Record<string, AIDocumentSessionHistoryEntry[]>
) {
  if (!Array.isArray(value)) return []

  const availableKeys = createAvailableHistoryEntryKeySet(sessionHistoryByDocument)
  const seen = new Set<string>()
  const nextCollections: AIHistoryCollection[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<AIHistoryCollection>
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.createdAt !== 'number' ||
      typeof candidate.updatedAt !== 'number'
    ) {
      continue
    }

    const name = candidate.name.trim()
    if (!name || seen.has(candidate.id)) continue

    const entryRefs = normalizeHistoryEntryRefs(
      Array.isArray(candidate.entryRefs) ? candidate.entryRefs : [],
      availableKeys
    )
    if (entryRefs.length === 0) continue

    seen.add(candidate.id)
    nextCollections.push({
      id: candidate.id,
      name,
      entryRefs,
      retrievalPolicy: sanitizeHistoryCollectionRetrievalPolicy(candidate.retrievalPolicy),
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    })
  }

  return nextCollections
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_HISTORY_COLLECTIONS)
}

function normalizeHistorySavedViews(value: unknown, collections: readonly AIHistoryCollection[]) {
  if (!Array.isArray(value)) return []

  const collectionIds = new Set(collections.map((collection) => collection.id))
  const seen = new Set<string>()
  const nextViews: AIHistorySavedView[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<AIHistorySavedView>
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.createdAt !== 'number' ||
      typeof candidate.updatedAt !== 'number'
    ) {
      continue
    }

    const name = candidate.name.trim()
    const query = typeof candidate.query === 'string' ? candidate.query.trim() : ''
    const collectionId =
      typeof candidate.collectionId === 'string' && collectionIds.has(candidate.collectionId)
        ? candidate.collectionId
        : null

    if (!name || seen.has(candidate.id) || (query.length === 0 && !collectionId)) continue

    seen.add(candidate.id)
    nextViews.push({
      id: candidate.id,
      name,
      query,
      collectionId,
      retrievalPreset: sanitizeHistorySavedViewRetrievalPreset(candidate.retrievalPreset),
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    })
  }

  return nextViews
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_HISTORY_SAVED_VIEWS)
}

function normalizeHistoryProviderRerankAudit(value: unknown) {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const nextEntries: AIHistoryProviderRerankAuditEntry[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<AIHistoryProviderRerankAuditEntry>
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.query !== 'string' ||
      typeof candidate.createdAt !== 'number' ||
      typeof candidate.candidateCount !== 'number' ||
      typeof candidate.sentCount !== 'number' ||
      typeof candidate.status !== 'string'
    ) {
      continue
    }
    if (seen.has(candidate.id)) continue
    if (candidate.status !== 'success' && candidate.status !== 'error') continue

    seen.add(candidate.id)
    nextEntries.push({
      id: candidate.id,
      query: candidate.query.trim(),
      budget: sanitizeHistoryProviderRerankBudget(candidate.budget),
      collectionId: typeof candidate.collectionId === 'string' ? candidate.collectionId : null,
      savedViewId: typeof candidate.savedViewId === 'string' ? candidate.savedViewId : null,
      retrievalStatusFilter: sanitizeHistorySavedViewStatusFilter(candidate.retrievalStatusFilter),
      retrievalPinnedOnly: candidate.retrievalPinnedOnly === true,
      candidateCount: Math.max(0, Math.round(candidate.candidateCount)),
      sentCount: Math.max(0, Math.round(candidate.sentCount)),
      providerModel: typeof candidate.providerModel === 'string' ? candidate.providerModel : null,
      status: candidate.status,
      errorMessage: typeof candidate.errorMessage === 'string' ? candidate.errorMessage : null,
      createdAt: candidate.createdAt,
    })
  }

  return nextEntries
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_HISTORY_PROVIDER_RERANK_AUDIT)
}

function synchronizeHistoryCollectionsAndViews(
  collections: readonly AIHistoryCollection[],
  savedViews: readonly AIHistorySavedView[],
  sessionHistoryByDocument: Record<string, AIDocumentSessionHistoryEntry[]>
) {
  const nextCollections = normalizeHistoryCollections(collections, sessionHistoryByDocument)
  const nextSavedViews = normalizeHistorySavedViews(savedViews, nextCollections)

  return {
    historyCollections: nextCollections,
    historySavedViews: nextSavedViews,
  }
}

export function createInitialAIComposerState(): AIComposerState {
  return {
    open: false,
    source: 'shortcut',
    intent: 'ask',
    scope: 'current-block',
    outputTarget: 'chat-only',
    prompt: '',
    context: null,
    requestState: 'idle',
    draftText: '',
    explanationText: '',
    diffBaseText: null,
    threadId: null,
    startedAt: null,
    errorMessage: null,
    sourceSnapshot: null,
  }
}

export const useAIStore = create<AIStoreState>()(
  persist(
    (set, get) => ({
      composer: createInitialAIComposerState(),
      historyRetentionPreset: 'standard',
      threadIdsByDocument: {},
      sessionHistoryByDocument: {},
      historyCollections: [],
      historySavedViews: [],
      historyProviderRerankAudit: [],
      provenanceMarksByTab: {},
      openComposer: (args = {}) =>
        set((state) => ({
          composer: {
            ...state.composer,
            ...args,
            open: true,
            requestState: args.requestState ?? 'idle',
            startedAt: args.startedAt ?? null,
            errorMessage: args.errorMessage ?? null,
          },
        })),
      closeComposer: () => set({ composer: createInitialAIComposerState() }),
      setIntent: (intent) => set((state) => ({ composer: { ...state.composer, intent } })),
      setScope: (scope) => set((state) => ({ composer: { ...state.composer, scope } })),
      setOutputTarget: (outputTarget) => set((state) => ({ composer: { ...state.composer, outputTarget } })),
      setPrompt: (prompt) => set((state) => ({ composer: { ...state.composer, prompt } })),
      setContext: (context) => set((state) => ({ composer: { ...state.composer, context } })),
      setSource: (source) => set((state) => ({ composer: { ...state.composer, source } })),
      setDraftText: (draftText) => set((state) => ({ composer: { ...state.composer, draftText } })),
      appendDraftText: (chunk) =>
        set((state) => ({ composer: { ...state.composer, draftText: `${state.composer.draftText}${chunk}` } })),
      setExplanationText: (explanationText) =>
        set((state) => ({ composer: { ...state.composer, explanationText } })),
      setDiffBaseText: (diffBaseText) => set((state) => ({ composer: { ...state.composer, diffBaseText } })),
      setThreadId: (threadId) => set((state) => ({ composer: { ...state.composer, threadId } })),
      setSourceSnapshot: (sourceSnapshot) => set((state) => ({ composer: { ...state.composer, sourceSnapshot } })),
      setRequestState: (requestState) =>
        set((state) => ({
          composer: {
            ...state.composer,
            requestState,
            startedAt: requestState === 'streaming' ? Date.now() : state.composer.startedAt,
          },
        })),
      startRequest: () =>
        set((state) => ({
          composer: {
            ...state.composer,
            requestState: 'streaming',
            startedAt: Date.now(),
            errorMessage: null,
            draftText: '',
            explanationText: '',
          },
        })),
      finishRequest: () =>
        set((state) => ({
          composer: {
            ...state.composer,
            requestState: 'done',
            errorMessage: null,
          },
        })),
      failRequest: (errorMessage) =>
        set((state) => ({
          composer: {
            ...state.composer,
            requestState: 'error',
            errorMessage,
          },
        })),
      resetDraftState: () =>
        set((state) => ({
          composer: {
            ...state.composer,
            requestState: 'idle',
            draftText: '',
            explanationText: '',
            diffBaseText: null,
            errorMessage: null,
            startedAt: null,
          },
        })),
      setHistoryRetentionPreset: (preset) =>
        set((state) => {
          const nextPreset = sanitizeHistoryRetentionPreset(preset)
          const nextSessionHistory = normalizeSessionHistoryByDocument(state.sessionHistoryByDocument, nextPreset)
          const { historyCollections, historySavedViews } = synchronizeHistoryCollectionsAndViews(
            state.historyCollections,
            state.historySavedViews,
            nextSessionHistory
          )
          return {
            historyRetentionPreset: nextPreset,
            threadIdsByDocument: filterThreadIdsByDocument(state.threadIdsByDocument, nextSessionHistory),
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections,
            historySavedViews,
          }
        }),
      ensureThreadId: (tabId, tabPath) => {
        const documentKey = getAIDocumentThreadKey(tabId, tabPath)
        const existing = get().threadIdsByDocument[documentKey]
        if (existing) return existing

        const threadId = createAIThreadId()
        set((state) => ({
          threadIdsByDocument: {
            ...state.threadIdsByDocument,
            [documentKey]: threadId,
          },
        }))
        return threadId
      },
      bindThreadId: (tabId, tabPath, threadId) =>
        set((state) => ({
          threadIdsByDocument: {
            ...state.threadIdsByDocument,
            [getAIDocumentThreadKey(tabId, tabPath)]: threadId,
          },
        })),
      getThreadId: (tabId, tabPath) => get().threadIdsByDocument[getAIDocumentThreadKey(tabId, tabPath)] ?? null,
      rekeyDocumentHistory: (tabId, previousPath, nextPath) => {
        const previousKey = getAIDocumentThreadKey(tabId, previousPath)
        const nextKey = getAIDocumentThreadKey(tabId, nextPath)
        if (previousKey === nextKey) return

        set((state) => {
          const previousEntries = state.sessionHistoryByDocument[previousKey] ?? []
          const nextEntries = state.sessionHistoryByDocument[nextKey] ?? []
          const mergedEntries = normalizeSessionHistoryEntries(
            [...previousEntries, ...nextEntries],
            state.historyRetentionPreset
          )
          const nextSessionHistory = normalizeSessionHistoryByDocument({
            ...state.sessionHistoryByDocument,
            [nextKey]: mergedEntries,
          }, state.historyRetentionPreset)
          delete nextSessionHistory[previousKey]

          const previousThreadId = state.threadIdsByDocument[previousKey]
          const nextThreadId = state.threadIdsByDocument[nextKey]
          const nextThreadIds = {
            ...state.threadIdsByDocument,
          }
          delete nextThreadIds[previousKey]
          if (previousThreadId || nextThreadId) {
            nextThreadIds[nextKey] = nextThreadId ?? previousThreadId ?? createAIThreadId()
          }
          const remappedCollections = state.historyCollections.map((collection) => ({
            ...collection,
            entryRefs: collection.entryRefs.map((ref) =>
              ref.documentKey === previousKey
                ? { ...ref, documentKey: nextKey }
                : ref
            ),
          }))
          const { historyCollections, historySavedViews } = synchronizeHistoryCollectionsAndViews(
            remappedCollections,
            state.historySavedViews,
            nextSessionHistory
          )

          return {
            threadIdsByDocument: filterThreadIdsByDocument(nextThreadIds, nextSessionHistory),
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections,
            historySavedViews,
          }
        })
      },
      remapHistoryForPathChange: (oldPath, newPath) => {
        set((state) => {
          const remappedHistoryEntries = Object.entries(state.sessionHistoryByDocument).map(([documentKey, entries]) => {
            const nextDocumentKey = remapPathPrefix(documentKey, `path:${oldPath.replace(/\\/g, '/')}`, `path:${newPath.replace(/\\/g, '/')}`) ?? documentKey
            return [nextDocumentKey, entries] as const
          })
          const nextSessionHistory = normalizeSessionHistoryByDocument(
            Object.fromEntries(remappedHistoryEntries),
            state.historyRetentionPreset
          )
          const remappedThreadEntries = Object.entries(state.threadIdsByDocument).map(([documentKey, threadId]) => {
            const nextDocumentKey = remapPathPrefix(documentKey, `path:${oldPath.replace(/\\/g, '/')}`, `path:${newPath.replace(/\\/g, '/')}`) ?? documentKey
            return [nextDocumentKey, threadId] as const
          })
          const remappedCollections = state.historyCollections.map((collection) => ({
            ...collection,
            entryRefs: collection.entryRefs.map((ref) => ({
              ...ref,
              documentKey:
                remapPathPrefix(ref.documentKey, `path:${oldPath.replace(/\\/g, '/')}`, `path:${newPath.replace(/\\/g, '/')}`) ??
                ref.documentKey,
            })),
          }))
          const { historyCollections, historySavedViews } = synchronizeHistoryCollectionsAndViews(
            remappedCollections,
            state.historySavedViews,
            nextSessionHistory
          )

          return {
            threadIdsByDocument: filterThreadIdsByDocument(Object.fromEntries(remappedThreadEntries), nextSessionHistory),
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections,
            historySavedViews,
          }
        })
      },
      removeHistoryByPathPrefix: (pathPrefix) => {
        const normalizedPrefix = `path:${pathPrefix.replace(/\\/g, '/')}`
        set((state) => {
          const nextSessionHistory = Object.fromEntries(
            Object.entries(state.sessionHistoryByDocument).filter(([documentKey]) => !pathMatchesPrefix(documentKey, normalizedPrefix))
          )
          const { historyCollections, historySavedViews } = synchronizeHistoryCollectionsAndViews(
            state.historyCollections,
            state.historySavedViews,
            nextSessionHistory
          )

          return {
            threadIdsByDocument: filterThreadIdsByDocument(state.threadIdsByDocument, nextSessionHistory),
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections,
            historySavedViews,
          }
        })
      },
      startSessionHistory: (args) => {
        const documentKey = getAIDocumentThreadKey(args.tabId, args.tabPath)
        const resolvedThreadId = args.threadId ?? get().threadIdsByDocument[documentKey] ?? createAIThreadId()
        const entryId = createAISessionHistoryEntryId()
        const createdAt = Date.now()

        set((state) => {
          const currentEntries = state.sessionHistoryByDocument[documentKey] ?? []
          const nextEntry: AIDocumentSessionHistoryEntry = {
            id: entryId,
            threadId: resolvedThreadId,
            pinned: false,
            source: args.source,
            intent: args.intent,
            scope: args.scope,
            outputTarget: args.outputTarget,
            prompt: args.prompt,
            resultPreview: null,
            errorMessage: null,
            status: 'streaming',
            documentName: args.documentName,
            attachmentCount: args.attachmentCount,
            createdAt,
            updatedAt: createdAt,
          }
          const nextSessionHistory = mergeSessionHistoryByDocument(state.sessionHistoryByDocument, documentKey, [
            nextEntry,
            ...currentEntries,
          ], state.historyRetentionPreset)
          const nextThreadIds =
            state.threadIdsByDocument[documentKey] === resolvedThreadId
              ? state.threadIdsByDocument
              : {
                  ...state.threadIdsByDocument,
                  [documentKey]: resolvedThreadId,
                }
          const { historyCollections, historySavedViews } = synchronizeHistoryCollectionsAndViews(
            state.historyCollections,
            state.historySavedViews,
            nextSessionHistory
          )

          return {
            threadIdsByDocument: filterThreadIdsByDocument(nextThreadIds, nextSessionHistory),
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections,
            historySavedViews,
          }
        })

        return { entryId, threadId: resolvedThreadId }
      },
      updateSessionHistory: (tabId, tabPath, entryId, patch) => {
        const documentKey = getAIDocumentThreadKey(tabId, tabPath)
        set((state) => {
          const currentEntries = state.sessionHistoryByDocument[documentKey] ?? []
          if (currentEntries.length === 0) return {}

          const nextSessionHistory = mergeSessionHistoryByDocument(
            state.sessionHistoryByDocument,
            documentKey,
            currentEntries.map((entry) =>
              entry.id === entryId
                ? {
                    ...entry,
                    ...patch,
                    updatedAt: patch.updatedAt ?? Date.now(),
                }
                : entry
            ),
            state.historyRetentionPreset
          )
          const { historyCollections, historySavedViews } = synchronizeHistoryCollectionsAndViews(
            state.historyCollections,
            state.historySavedViews,
            nextSessionHistory
          )

          return {
            threadIdsByDocument: filterThreadIdsByDocument(state.threadIdsByDocument, nextSessionHistory),
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections,
            historySavedViews,
          }
        })
      },
      getSessionHistory: (tabId, tabPath) => get().sessionHistoryByDocument[getAIDocumentThreadKey(tabId, tabPath)] ?? [],
      toggleSessionHistoryPin: (tabId, tabPath, entryId) => {
        const documentKey = getAIDocumentThreadKey(tabId, tabPath)
        set((state) => {
          const currentEntries = state.sessionHistoryByDocument[documentKey] ?? []
          if (currentEntries.length === 0) return {}

          const nextSessionHistory = mergeSessionHistoryByDocument(
            state.sessionHistoryByDocument,
            documentKey,
            currentEntries.map((entry) =>
              entry.id === entryId
                ? {
                    ...entry,
                    pinned: !entry.pinned,
                    updatedAt: Date.now(),
                  }
                : entry
            ),
            state.historyRetentionPreset
          )
          const { historyCollections, historySavedViews } = synchronizeHistoryCollectionsAndViews(
            state.historyCollections,
            state.historySavedViews,
            nextSessionHistory
          )

          return {
            threadIdsByDocument: filterThreadIdsByDocument(state.threadIdsByDocument, nextSessionHistory),
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections,
            historySavedViews,
          }
        })
      },
      removeSessionHistoryEntry: (tabId, tabPath, entryId) => {
        const documentKey = getAIDocumentThreadKey(tabId, tabPath)
        set((state) => {
          const currentEntries = state.sessionHistoryByDocument[documentKey] ?? []
          if (currentEntries.length === 0) return {}

          const nextEntries = currentEntries.filter((entry) => entry.id !== entryId)
          const nextSessionHistory = { ...state.sessionHistoryByDocument }
          if (nextEntries.length > 0) {
            nextSessionHistory[documentKey] = normalizeSessionHistoryEntries(nextEntries, state.historyRetentionPreset)
          } else {
            delete nextSessionHistory[documentKey]
          }
          const { historyCollections, historySavedViews } = synchronizeHistoryCollectionsAndViews(
            state.historyCollections,
            state.historySavedViews,
            nextSessionHistory
          )

          return {
            threadIdsByDocument: filterThreadIdsByDocument(state.threadIdsByDocument, nextSessionHistory),
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections,
            historySavedViews,
          }
        })
      },
      clearSessionHistory: (tabId, tabPath, options = {}) => {
        const documentKey = getAIDocumentThreadKey(tabId, tabPath)
        const preservePinned = options.preservePinned ?? true
        set((state) => {
          const currentEntries = state.sessionHistoryByDocument[documentKey] ?? []
          if (currentEntries.length === 0) return {}

          const nextEntries = preservePinned ? currentEntries.filter((entry) => entry.pinned) : []
          const nextSessionHistory = { ...state.sessionHistoryByDocument }
          if (nextEntries.length > 0) {
            nextSessionHistory[documentKey] = normalizeSessionHistoryEntries(nextEntries, state.historyRetentionPreset)
          } else {
            delete nextSessionHistory[documentKey]
          }
          const { historyCollections, historySavedViews } = synchronizeHistoryCollectionsAndViews(
            state.historyCollections,
            state.historySavedViews,
            nextSessionHistory
          )

          return {
            threadIdsByDocument: filterThreadIdsByDocument(state.threadIdsByDocument, nextSessionHistory),
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections,
            historySavedViews,
          }
        })
      },
      clearAllSessionHistory: (options = {}) => {
        const preservePinned = options.preservePinned ?? true
        set((state) => {
          if (!preservePinned) {
            return {
              threadIdsByDocument: {},
              sessionHistoryByDocument: {},
              historyCollections: [],
              historySavedViews: [],
            }
          }

          const nextSessionHistory = normalizeSessionHistoryByDocument(
            Object.fromEntries(
              Object.entries(state.sessionHistoryByDocument)
                .map(([documentKey, entries]) => [documentKey, entries.filter((entry) => entry.pinned)] as const)
                .filter(([, entries]) => entries.length > 0)
            ),
            state.historyRetentionPreset
          )
          const { historyCollections, historySavedViews } = synchronizeHistoryCollectionsAndViews(
            state.historyCollections,
            state.historySavedViews,
            nextSessionHistory
          )

          return {
            threadIdsByDocument: filterThreadIdsByDocument(state.threadIdsByDocument, nextSessionHistory),
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections,
            historySavedViews,
          }
        })
      },
      createHistoryCollection: (name, entryRefs, options = {}) => {
        const trimmedName = name.trim()
        if (!trimmedName) return null

        const state = get()
        const normalizedCollections = normalizeHistoryCollections(state.historyCollections, state.sessionHistoryByDocument)
        const availableKeys = createAvailableHistoryEntryKeySet(state.sessionHistoryByDocument)
        const normalizedRefs = normalizeHistoryEntryRefs(entryRefs, availableKeys)
        if (normalizedRefs.length === 0) return null

        const id = createAIHistoryCollectionId()
        const createdAt = Date.now()
        const retrievalPolicy = sanitizeHistoryCollectionRetrievalPolicy(options.retrievalPolicy)
        const nextCollections = normalizeHistoryCollections(
          [
            {
              id,
              name: trimmedName,
              entryRefs: normalizedRefs,
              retrievalPolicy,
              createdAt,
              updatedAt: createdAt,
            },
            ...normalizedCollections,
          ],
          state.sessionHistoryByDocument
        )
        const nextSavedViews = normalizeHistorySavedViews(state.historySavedViews, nextCollections)

        set({
          historyCollections: nextCollections,
          historySavedViews: nextSavedViews,
        })

        return id
      },
      updateHistoryCollectionPolicy: (collectionId, policy) =>
        set((state) => {
          if (!state.historyCollections.some((collection) => collection.id === collectionId)) return {}

          const nextCollections = normalizeHistoryCollections(
            state.historyCollections.map((collection) =>
              collection.id === collectionId
                ? {
                    ...collection,
                    retrievalPolicy: sanitizeHistoryCollectionRetrievalPolicy({
                      ...collection.retrievalPolicy,
                      ...policy,
                    }),
                    updatedAt: Date.now(),
                  }
                : collection
            ),
            state.sessionHistoryByDocument
          )
          const nextSavedViews = normalizeHistorySavedViews(state.historySavedViews, nextCollections)

          return {
            historyCollections: nextCollections,
            historySavedViews: nextSavedViews,
          }
        }),
      deleteHistoryCollection: (collectionId) =>
        set((state) => {
          const nextCollections = state.historyCollections.filter((collection) => collection.id !== collectionId)
          const nextSavedViews = normalizeHistorySavedViews(
            state.historySavedViews.map((view) =>
              view.collectionId === collectionId
                ? { ...view, collectionId: null, updatedAt: Date.now() }
                : view
            ),
            nextCollections
          )
          return {
            historyCollections: nextCollections,
            historySavedViews: nextSavedViews,
          }
        }),
      createHistorySavedView: (name, options) => {
        const trimmedName = name.trim()
        const trimmedQuery = options.query.trim()
        const collectionId =
          typeof options.collectionId === 'string' &&
          get().historyCollections.some((collection) => collection.id === options.collectionId)
            ? options.collectionId
            : null

        if (!trimmedName || (trimmedQuery.length === 0 && !collectionId)) return null

        const id = createAIHistorySavedViewId()
        const createdAt = Date.now()
        const retrievalPreset = sanitizeHistorySavedViewRetrievalPreset(options.retrievalPreset)
        const nextViews = normalizeHistorySavedViews(
          [
            {
              id,
              name: trimmedName,
              query: trimmedQuery,
              collectionId,
              retrievalPreset,
              createdAt,
              updatedAt: createdAt,
            },
            ...get().historySavedViews,
          ],
          get().historyCollections
        )

        set({ historySavedViews: nextViews })
        return id
      },
      updateHistorySavedViewRetrievalPreset: (viewId, preset) =>
        set((state) => {
          if (!state.historySavedViews.some((view) => view.id === viewId)) return {}

          return {
            historySavedViews: normalizeHistorySavedViews(
              state.historySavedViews.map((view) =>
                view.id === viewId
                  ? {
                      ...view,
                      retrievalPreset: sanitizeHistorySavedViewRetrievalPreset({
                        ...view.retrievalPreset,
                        ...preset,
                      }),
                      updatedAt: Date.now(),
                    }
                  : view
              ),
              state.historyCollections
            ),
          }
        }),
      deleteHistorySavedView: (viewId) =>
        set((state) => ({
          historySavedViews: state.historySavedViews.filter((view) => view.id !== viewId),
        })),
      addHistoryProviderRerankAudit: (entry) => {
        const id = createAIHistoryProviderRerankAuditId()
        const createdAt = Date.now()
        set((state) => ({
          historyProviderRerankAudit: normalizeHistoryProviderRerankAudit([
            {
              id,
              createdAt,
              ...entry,
            },
            ...state.historyProviderRerankAudit,
          ]),
        }))
        return id
      },
      exportHistoryArchive: () => {
        const state = get()
        const sessionHistoryByDocument = normalizeSessionHistoryByDocument(
          state.sessionHistoryByDocument,
          state.historyRetentionPreset
        )
        const threadIdsByDocument = filterThreadIdsByDocument(state.threadIdsByDocument, sessionHistoryByDocument)
        const historyCollections = normalizeHistoryCollections(state.historyCollections, sessionHistoryByDocument)
        const historySavedViews = normalizeHistorySavedViews(state.historySavedViews, historyCollections)
        const historyProviderRerankAudit = normalizeHistoryProviderRerankAudit(state.historyProviderRerankAudit)

        return {
          version: 1,
          exportedAt: Date.now(),
          historyRetentionPreset: state.historyRetentionPreset,
          threadIdsByDocument,
          sessionHistoryByDocument,
          historyCollections,
          historySavedViews,
          historyProviderRerankAudit,
        }
      },
      importHistoryArchive: (value, options = {}) => {
        const archive = sanitizeHistoryArchive(value)
        if (!archive) {
          throw new Error('Invalid AI history archive')
        }

        const mode = options.mode === 'replace' ? 'replace' : 'merge'
        const importedDocumentCount = Object.keys(archive.sessionHistoryByDocument).length
        const importedEntryCount = Object.values(archive.sessionHistoryByDocument).reduce(
          (total, entries) => total + entries.length,
          0
        )
        const importedAuditCount = archive.historyProviderRerankAudit?.length ?? 0

        set((state) => {
          const mergedHistoryInput =
            mode === 'replace'
              ? archive.sessionHistoryByDocument
              : Object.fromEntries(
                  Object.entries({
                    ...state.sessionHistoryByDocument,
                    ...archive.sessionHistoryByDocument,
                  }).map(([documentKey]) => [
                    documentKey,
                    [
                      ...(archive.sessionHistoryByDocument[documentKey] ?? []),
                      ...(state.sessionHistoryByDocument[documentKey] ?? []),
                    ],
                  ])
                )

          const nextSessionHistory = normalizeSessionHistoryByDocument(
            mergedHistoryInput,
            state.historyRetentionPreset
          )
          const nextThreadIds = filterThreadIdsByDocument(
            mode === 'replace'
              ? archive.threadIdsByDocument
              : {
                  ...state.threadIdsByDocument,
                  ...archive.threadIdsByDocument,
                },
            nextSessionHistory
          )
          const mergedCollectionsInput =
            mode === 'replace'
              ? archive.historyCollections ?? []
              : [...(archive.historyCollections ?? []), ...state.historyCollections]
          const nextCollections = normalizeHistoryCollections(mergedCollectionsInput, nextSessionHistory)
          const mergedViewsInput =
            mode === 'replace'
              ? archive.historySavedViews ?? []
              : [...(archive.historySavedViews ?? []), ...state.historySavedViews]
          const nextViews = normalizeHistorySavedViews(mergedViewsInput, nextCollections)
          const mergedAuditInput =
            mode === 'replace'
              ? archive.historyProviderRerankAudit ?? []
              : [...(archive.historyProviderRerankAudit ?? []), ...state.historyProviderRerankAudit]
          const nextAudit = normalizeHistoryProviderRerankAudit(mergedAuditInput)

          return {
            threadIdsByDocument: nextThreadIds,
            sessionHistoryByDocument: nextSessionHistory,
            historyCollections: nextCollections,
            historySavedViews: nextViews,
            historyProviderRerankAudit: nextAudit,
          }
        })

        return {
          documentCount: importedDocumentCount,
          entryCount: importedEntryCount,
          auditCount: importedAuditCount,
        }
      },
      setProvenanceMarks: (tabId, marks) =>
        set((state) => ({
          provenanceMarksByTab: {
            ...state.provenanceMarksByTab,
            [tabId]: marks,
          },
        })),
      addProvenanceMark: (tabId, mark) =>
        set((state) => ({
          provenanceMarksByTab: {
            ...state.provenanceMarksByTab,
            [tabId]: [...(state.provenanceMarksByTab[tabId] ?? []), mark],
          },
        })),
      getProvenanceMarks: (tabId) => get().provenanceMarksByTab[tabId] ?? [],
      clearProvenanceMarks: (tabId) =>
        set((state) => ({
          provenanceMarksByTab: {
            ...state.provenanceMarksByTab,
            [tabId]: [],
          },
        })),
    }),
    {
      name: AI_STORE_STORAGE_KEY,
      storage: createJSONStorage(getAIStoreStorage),
      partialize: (state) => {
        const sessionHistoryByDocument = normalizeSessionHistoryByDocument(
          state.sessionHistoryByDocument,
          state.historyRetentionPreset
        )
        const historyCollections = normalizeHistoryCollections(state.historyCollections, sessionHistoryByDocument)
        const historySavedViews = normalizeHistorySavedViews(state.historySavedViews, historyCollections)
        return {
          historyRetentionPreset: state.historyRetentionPreset,
          threadIdsByDocument: filterThreadIdsByDocument(state.threadIdsByDocument, sessionHistoryByDocument),
          sessionHistoryByDocument,
          historyCollections,
          historySavedViews,
          historyProviderRerankAudit: normalizeHistoryProviderRerankAudit(state.historyProviderRerankAudit),
        }
      },
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<AIStoreState> | undefined
        const historyRetentionPreset = sanitizeHistoryRetentionPreset(persistedState?.historyRetentionPreset)
        const sessionHistoryByDocument = normalizeSessionHistoryByDocument(
          persistedState?.sessionHistoryByDocument,
          historyRetentionPreset
        )
        const threadIdsByDocument = filterThreadIdsByDocument(persistedState?.threadIdsByDocument ?? {}, sessionHistoryByDocument)
        const historyCollections = normalizeHistoryCollections(persistedState?.historyCollections, sessionHistoryByDocument)
        const historySavedViews = normalizeHistorySavedViews(persistedState?.historySavedViews, historyCollections)
        const historyProviderRerankAudit = normalizeHistoryProviderRerankAudit(persistedState?.historyProviderRerankAudit)

        return {
          ...current,
          historyRetentionPreset,
          threadIdsByDocument,
          sessionHistoryByDocument,
          historyCollections,
          historySavedViews,
          historyProviderRerankAudit,
        }
      },
    }
  )
)
