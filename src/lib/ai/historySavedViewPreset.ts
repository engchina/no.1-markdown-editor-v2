import type {
  AIHistorySavedViewAutomationMode,
  AIHistoryProviderRerankBudget,
  AIHistorySavedViewRetrievalPreset,
  AIHistorySavedViewStatusFilter,
  AISessionHistoryStatus,
} from './types.ts'

export const DEFAULT_AI_HISTORY_SAVED_VIEW_RETRIEVAL_PRESET = Object.freeze({
  statusFilter: 'all',
  pinnedOnly: false,
  providerBudgetOverride: null,
  automationMode: 'manual',
}) satisfies AIHistorySavedViewRetrievalPreset

export function createDefaultAIHistorySavedViewRetrievalPreset(): AIHistorySavedViewRetrievalPreset {
  return {
    statusFilter: DEFAULT_AI_HISTORY_SAVED_VIEW_RETRIEVAL_PRESET.statusFilter,
    pinnedOnly: DEFAULT_AI_HISTORY_SAVED_VIEW_RETRIEVAL_PRESET.pinnedOnly,
    providerBudgetOverride: DEFAULT_AI_HISTORY_SAVED_VIEW_RETRIEVAL_PRESET.providerBudgetOverride,
    automationMode: DEFAULT_AI_HISTORY_SAVED_VIEW_RETRIEVAL_PRESET.automationMode,
  }
}

export function sanitizeAIHistorySavedViewAutomationMode(
  value: unknown
): AIHistorySavedViewAutomationMode {
  switch (value) {
    case 'workspace-run-draft':
    case 'provider-ranked-workspace-run-draft':
    case 'manual':
      return value
    default:
      return 'manual'
  }
}

export function resolveAIHistorySavedViewProviderRerankBudget(
  baseBudget: AIHistoryProviderRerankBudget,
  preset: AIHistorySavedViewRetrievalPreset | null | undefined
) {
  return preset?.providerBudgetOverride ?? baseBudget
}

export function isAIHistorySavedViewRetrievalPresetCustomized(
  preset: AIHistorySavedViewRetrievalPreset | null | undefined
) {
  if (!preset) return false

  return (
    preset.statusFilter !== DEFAULT_AI_HISTORY_SAVED_VIEW_RETRIEVAL_PRESET.statusFilter ||
    preset.pinnedOnly !== DEFAULT_AI_HISTORY_SAVED_VIEW_RETRIEVAL_PRESET.pinnedOnly ||
    preset.providerBudgetOverride !== DEFAULT_AI_HISTORY_SAVED_VIEW_RETRIEVAL_PRESET.providerBudgetOverride ||
    preset.automationMode !== DEFAULT_AI_HISTORY_SAVED_VIEW_RETRIEVAL_PRESET.automationMode
  )
}

export function matchesAIHistorySavedViewStatusFilter(
  status: AISessionHistoryStatus,
  filter: AIHistorySavedViewStatusFilter
) {
  return filter === 'all' || status === filter
}
