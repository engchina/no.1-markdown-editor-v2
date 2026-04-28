import type { DocumentLanguage } from '../documentLanguage.ts'

export type AIIntent = 'ask' | 'edit' | 'generate' | 'review'
export type AIScope = 'selection' | 'current-block' | 'document'
export type AIOutputTarget =
  | 'chat-only'
  | 'replace-selection'
  | 'replace-current-block'
  | 'at-cursor'
  | 'insert-below'
  | 'new-note'
export type AISelectedTextRole = 'transform-target' | 'reference-only'
export type AIDocumentLanguage = DocumentLanguage
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
export type AIProviderKind = 'openai-compatible' | 'oci-responses'
export type AIExecutionTargetKind = 'direct-provider' | 'oracle-hosted-agent'
export type AIInvocationCapability =
  | 'text-generation'
  | 'rag-unstructured'
  | 'nl2sql-draft'
  | 'structured-execution'
export type AIKnowledgeType = 'none' | 'docs' | 'data' | 'agent'
export type AIOracleStructuredStoreMode = 'sql-draft' | 'agent-answer'
export type AIHostedAgentTransport = 'http-json' | 'sse'
export type AIMCPExecutionTransport = 'stdio' | 'streamable-http'
export type AIOracleEnrichmentMode = 'full' | 'partial' | 'delta'
export type AIStorageKind = 'keyring' | 'unsupported'
export type AIExplicitContextKind = 'note' | 'search'
export type AIPromptMentionKind = AIExplicitContextKind
export type AIProvenanceKind = 'apply' | 'ghost-text' | 'new-note'
export type AIDraftFormat = 'markdown' | 'sql' | 'text'
export type AIPromptMentionErrorCode =
  | 'note-not-found'
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

export interface AIOracleUnstructuredStoreRegistration {
  id: string
  label: string
  vectorStoreId: string
  description: string
  enabled: boolean
  isDefault: boolean
}

export interface AIOracleStructuredStoreRegistration {
  id: string
  label: string
  semanticStoreId: string
  compartmentId?: string
  storeOcid?: string
  ociAuthProfileId: string | null
  regionOverride: string
  schemaName: string
  description: string
  enabled: boolean
  isDefault: boolean
  defaultMode: AIOracleStructuredStoreMode
  executionProfileId: string | null
  enrichmentDefaultMode: AIOracleEnrichmentMode
  enrichmentObjectNames: string
}

export interface AIOracleOCIAuthProfile {
  id: string
  label: string
  configFile: string
  profile: string
  region: string
  tenancy: string
  user: string
  fingerprint: string
  keyFile: string
  enabled: boolean
}

export interface AIOracleMCPExecutionProfile {
  id: string
  label: string
  description: string
  configJson: string
  command: string
  args: string[]
  serverUrl: string
  transport: AIMCPExecutionTransport
  toolName: string
  enabled: boolean
}

export interface AIOracleHostedAgentProfile {
  id: string
  label: string
  ociRegion: string
  hostedApplicationOcid: string
  apiVersion: string
  apiAction: string
  domainUrl: string
  clientId: string
  scope: string
  transport: AIHostedAgentTransport
}

export interface AIOpenAICompatibleProviderConfig {
  provider: 'openai-compatible'
  baseUrl: string
  model: string
  project: string
}

export interface AIOCIResponsesProviderConfig {
  provider: 'oci-responses'
  baseUrl: string
  model: string
  project: string
  ociAuthProfiles: AIOracleOCIAuthProfile[]
  unstructuredStores: AIOracleUnstructuredStoreRegistration[]
  structuredStores: AIOracleStructuredStoreRegistration[]
  mcpExecutionProfiles: AIOracleMCPExecutionProfile[]
  hostedAgentProfiles: AIOracleHostedAgentProfile[]
}

export type AIProviderConfig = AIOpenAICompatibleProviderConfig | AIOCIResponsesProviderConfig

export interface AINoKnowledgeSelection {
  kind: 'none'
}

export interface AIOracleUnstructuredKnowledgeSelection {
  kind: 'oracle-unstructured-store'
  registrationId: string
}

export interface AIOracleStructuredKnowledgeSelection {
  kind: 'oracle-structured-store'
  registrationId: string
  mode: AIOracleStructuredStoreMode
}

export type AIKnowledgeSelection =
  | AINoKnowledgeSelection
  | AIOracleUnstructuredKnowledgeSelection
  | AIOracleStructuredKnowledgeSelection

export interface AIRunCompletionRequest {
  requestId: string
  intent: AIIntent
  scope: AIScope
  outputTarget: AIOutputTarget
  prompt: string
  context: AIContextPacket
  messages: AIRequestMessage[]
  executionTargetKind: AIExecutionTargetKind
  invocationCapability: AIInvocationCapability
  knowledgeSelection: AIKnowledgeSelection
  threadId: string | null
  hostedAgentProfileId: string | null
  generatedSql?: string | null
}

export interface AIRunCompletionResponse {
  text: string
  finishReason: string | null
  model: string | null
  requestId: string | null
  threadId: string | null
  contentType: AIDraftFormat
  explanationText: string | null
  warningText: string | null
  sourceLabel: string | null
  retrievalExecuted: boolean
  retrievalQuery: string | null
  retrievalResults: AIRetrievalResultPreview[]
  retrievalResultCount: number | null
  generatedSql: string | null
  structuredExecutionStatus: string | null
  structuredExecutionToolName: string | null
}

export interface AIRetrievalResultPreview {
  title: string
  detail: string | null
  snippet: string | null
}

export interface AIProviderState {
  config: AIProviderConfig | null
  hasApiKey: boolean
  storageKind: AIStorageKind
  hasOCIKeyFilePassphraseById: Record<string, boolean>
  hasHostedAgentClientSecretById: Record<string, boolean>
}

export interface AICompletionStreamChunk {
  requestId: string
  chunk: string
}

export interface AIApplySnapshot {
  tabId: string
  selectionFrom: number
  selectionTo: number
  anchorOffset: number
  blockFrom: number
  blockTo: number
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
  executionTargetKind: AIExecutionTargetKind
  invocationCapability: AIInvocationCapability
  knowledgeSelection: AIKnowledgeSelection
  hostedAgentProfileId: string | null
  requestState: AIRequestState
  draftText: string
  draftFormat: AIDraftFormat
  explanationText: string
  warningText: string | null
  sourceLabel: string | null
  retrievalExecuted: boolean
  retrievalQuery: string | null
  retrievalResults: AIRetrievalResultPreview[]
  retrievalResultCount: number | null
  generatedSql: string | null
  structuredExecutionStatus: string | null
  structuredExecutionToolName: string | null
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
  executionTargetKind?: AIExecutionTargetKind
  knowledgeKind?: AIKnowledgeSelection['kind']
  storeLabel?: string | null
  structuredMode?: AIOracleStructuredStoreMode | null
  generatedSqlPreview?: string | null
  executionAgentLabel?: string | null
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
