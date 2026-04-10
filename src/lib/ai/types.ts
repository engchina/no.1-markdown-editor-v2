export type AIIntent = 'ask' | 'edit' | 'generate' | 'review'
export type AIScope = 'selection' | 'current-block' | 'current-heading' | 'document'
export type AIOutputTarget =
  | 'chat-only'
  | 'replace-selection'
  | 'at-cursor'
  | 'insert-below'
  | 'insert-under-heading'
  | 'new-note'
export type AISelectedTextRole = 'transform-target' | 'reference-only'
export type AIDocumentLanguage = 'zh' | 'en' | 'ja' | 'mixed'
export type AIRequestState = 'idle' | 'streaming' | 'done' | 'error'
export type AISessionHistoryStatus = 'streaming' | 'done' | 'error' | 'canceled'
export type AIWorkspaceExecutionHistoryTaskStatus =
  | 'idle'
  | 'waiting'
  | 'running'
  | 'done'
  | 'error'
  | 'canceled'
export type AIWorkspaceExecutionHistoryTaskCompletionSource =
  | 'manual-apply'
  | 'manual-open-draft'
  | 'agent'
export type AIHistoryRetentionPreset = 'compact' | 'standard' | 'extended'
export type AIHistoryProviderRerankBudget = 'conservative' | 'balanced' | 'deep'
export type AIHistoryCollectionProviderMode = 'inherit' | 'local-only' | 'allow-provider'
export type AIHistorySavedViewStatusFilter = 'all' | AISessionHistoryStatus
export type AIHistorySavedViewAutomationMode =
  | 'manual'
  | 'workspace-run-draft'
  | 'provider-ranked-workspace-run-draft'
export type AIComposerSource =
  | 'shortcut'
  | 'selection-bubble'
  | 'command-palette'
  | 'slash-command'
  | 'sidebar-tab'
export type AIProviderKind = 'openai-compatible'
export type AIStorageKind = 'keyring' | 'unsupported'
export type AIExplicitContextKind = 'note' | 'heading' | 'search'
export type AIPromptMentionKind = AIExplicitContextKind
export type AIProvenanceKind = 'apply' | 'ghost-text' | 'new-note'
export type AIPromptMentionErrorCode =
  | 'current-heading-unavailable'
  | 'note-not-found'
  | 'heading-not-found'
  | 'search-empty-query'
  | 'search-no-results'

export interface AIExplicitContextAttachment {
  id: string
  kind: AIExplicitContextKind
  label: string
  detail: string
  content: string
  query?: string
  truncated?: boolean
}

export interface AIPromptMention {
  id: string
  kind: AIPromptMentionKind
  query: string | null
  raw: string
  index: number
}

export interface AIPromptMentionResolution {
  mention: AIPromptMention
  status: 'resolved' | 'error'
  attachment?: AIExplicitContextAttachment
  errorCode?: AIPromptMentionErrorCode
}

export interface AIProvenanceMark {
  id: string
  from: number
  to: number
  badge: string
  detail: string
  kind: AIProvenanceKind
  createdAt: number
}

export interface AIContextPacket {
  tabId: string
  tabPath: string | null
  fileName: string
  documentLanguage: AIDocumentLanguage
  intent: AIIntent
  scope: AIScope
  outputTarget: AIOutputTarget
  selectedText?: string
  selectedTextRole?: AISelectedTextRole
  beforeText?: string
  afterText?: string
  currentBlock?: string
  headingPath?: string[]
  frontMatter?: string | null
  explicitContextAttachments?: AIExplicitContextAttachment[]
}

export interface AIRequestMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIRunCompletionRequest {
  requestId: string
  intent: AIIntent
  scope: AIScope
  outputTarget: AIOutputTarget
  prompt: string
  context: AIContextPacket
  messages: AIRequestMessage[]
}

export interface AIRunCompletionResponse {
  text: string
  finishReason: string | null
  model: string | null
  requestId: string | null
}

export interface AICompletionStreamChunk {
  requestId: string
  chunk: string
}

export interface AIProviderConfig {
  provider: AIProviderKind
  baseUrl: string
  model: string
  project: string
}

export interface AIProviderState {
  config: AIProviderConfig | null
  hasApiKey: boolean
  storageKind: AIStorageKind
}

export interface AIApplySnapshot {
  tabId: string
  selectionFrom: number
  selectionTo: number
  anchorOffset: number
  blockFrom: number
  blockTo: number
  headingFrom?: number
  headingTo?: number
  docText: string
}

export interface AIComposerState {
  open: boolean
  source: AIComposerSource
  intent: AIIntent
  scope: AIScope
  outputTarget: AIOutputTarget
  prompt: string
  context: AIContextPacket | null
  requestState: AIRequestState
  draftText: string
  explanationText: string
  diffBaseText: string | null
  threadId: string | null
  startedAt: number | null
  errorMessage: string | null
  sourceSnapshot: AIApplySnapshot | null
}

export interface AIWorkspaceExecutionHistoryTaskRecord {
  taskId: string
  action: 'update-note' | 'create-note'
  title: string
  target: string
  phase: string | null
  status: AIWorkspaceExecutionHistoryTaskStatus
  message: string | null
  completionSource: AIWorkspaceExecutionHistoryTaskCompletionSource | null
  completionAt: number | null
  originRunId: number | null
}

export interface AIWorkspaceExecutionHistoryRecord {
  summary: string | null
  taskCount: number
  completedCount: number
  failedCount: number
  waitingCount: number
  updatedAt: number
  tasks: AIWorkspaceExecutionHistoryTaskRecord[]
}

export interface AIDocumentSessionHistoryEntry {
  id: string
  threadId: string
  pinned: boolean
  source: AIComposerSource
  intent: AIIntent
  scope: AIScope
  outputTarget: AIOutputTarget
  prompt: string
  resultPreview: string | null
  errorMessage: string | null
  status: AISessionHistoryStatus
  documentName: string
  attachmentCount: number
  workspaceExecution?: AIWorkspaceExecutionHistoryRecord | null
  createdAt: number
  updatedAt: number
}

export interface AIHistoryEntryRef {
  documentKey: string
  entryId: string
}

export interface AIHistoryCollectionRetrievalPolicy {
  providerMode: AIHistoryCollectionProviderMode
  providerBudgetOverride: AIHistoryProviderRerankBudget | null
}

export interface AIHistoryCollection {
  id: string
  name: string
  entryRefs: AIHistoryEntryRef[]
  retrievalPolicy: AIHistoryCollectionRetrievalPolicy
  createdAt: number
  updatedAt: number
}

export interface AIHistorySavedView {
  id: string
  name: string
  query: string
  collectionId: string | null
  retrievalPreset: AIHistorySavedViewRetrievalPreset
  createdAt: number
  updatedAt: number
}

export interface AIHistorySavedViewRetrievalPreset {
  statusFilter: AIHistorySavedViewStatusFilter
  pinnedOnly: boolean
  providerBudgetOverride: AIHistoryProviderRerankBudget | null
  automationMode: AIHistorySavedViewAutomationMode
}

export interface AIHistoryProviderRerankAuditEntry {
  id: string
  query: string
  budget: AIHistoryProviderRerankBudget
  collectionId: string | null
  savedViewId: string | null
  retrievalStatusFilter: AIHistorySavedViewStatusFilter
  retrievalPinnedOnly: boolean
  candidateCount: number
  sentCount: number
  providerModel: string | null
  status: 'success' | 'error'
  errorMessage: string | null
  createdAt: number
}

export interface AIHistoryArchive {
  version: 1
  exportedAt: number
  historyRetentionPreset: AIHistoryRetentionPreset
  threadIdsByDocument: Record<string, string>
  sessionHistoryByDocument: Record<string, AIDocumentSessionHistoryEntry[]>
  historyCollections?: AIHistoryCollection[]
  historySavedViews?: AIHistorySavedView[]
  historyProviderRerankAudit?: AIHistoryProviderRerankAuditEntry[]
}
