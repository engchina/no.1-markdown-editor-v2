import type { AIDocumentSessionHistoryEntry } from './types.ts'

export type AIHistoryWorkspaceFacet =
  | 'all'
  | 'workspace'
  | 'workspace-completed'
  | 'workspace-attention'

export function hasAIHistoryWorkspaceExecution(
  entry: Pick<AIDocumentSessionHistoryEntry, 'workspaceExecution'>
) {
  return (entry.workspaceExecution?.taskCount ?? 0) > 0
}

export function isAIHistoryWorkspaceExecutionCompleted(
  entry: Pick<AIDocumentSessionHistoryEntry, 'workspaceExecution'>
) {
  const record = entry.workspaceExecution
  if (!record || record.taskCount <= 0) return false

  return record.completedCount >= record.taskCount && record.failedCount === 0 && record.waitingCount === 0
}

export function isAIHistoryWorkspaceExecutionNeedingAttention(
  entry: Pick<AIDocumentSessionHistoryEntry, 'workspaceExecution'>
) {
  const record = entry.workspaceExecution
  if (!record || record.taskCount <= 0) return false

  return record.failedCount > 0 || record.waitingCount > 0
}

export function matchesAIHistoryWorkspaceFacet(
  entry: Pick<AIDocumentSessionHistoryEntry, 'workspaceExecution'>,
  facet: AIHistoryWorkspaceFacet
) {
  switch (facet) {
    case 'workspace':
      return hasAIHistoryWorkspaceExecution(entry)
    case 'workspace-completed':
      return isAIHistoryWorkspaceExecutionCompleted(entry)
    case 'workspace-attention':
      return isAIHistoryWorkspaceExecutionNeedingAttention(entry)
    case 'all':
    default:
      return true
  }
}
