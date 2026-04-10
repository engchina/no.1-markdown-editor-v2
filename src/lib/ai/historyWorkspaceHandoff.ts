import { parseAIDocumentThreadKey } from './thread.ts'
import type {
  AIHistoryRetrievalCandidate,
  AIHistoryRetrievalMatch,
} from './historyRetrieval.ts'
import { getAIHistoryWorkspaceExecutionStrength } from './historyRetrieval.ts'

export interface AIHistoryWorkspaceHandoffTarget {
  documentKey: string
  query: string
  label: string
  detail: string
}

export function collectAIHistoryWorkspaceHandoffTargets<T extends AIHistoryRetrievalCandidate>(
  matches: readonly AIHistoryRetrievalMatch<T>[],
  options: {
    currentDocumentKey?: string | null
    limit?: number
  } = {}
): AIHistoryWorkspaceHandoffTarget[] {
  const currentDocumentKey = options.currentDocumentKey ?? null
  const limit = options.limit ?? 4
  if (limit <= 0) return []

  const targetsByQuery = new Map<
    string,
    {
      target: AIHistoryWorkspaceHandoffTarget
      match: AIHistoryRetrievalMatch<T>
      order: number
    }
  >()
  let order = 0

  for (const match of matches) {
    const entry = match.candidate
    if (currentDocumentKey && entry.documentKey === currentDocumentKey) continue

    const target = resolveAIHistoryWorkspaceHandoffTarget(entry)
    if (!target) continue

    const key = target.query.trim().toLowerCase()
    if (!key) continue

    const existing = targetsByQuery.get(key)
    if (!existing) {
      targetsByQuery.set(key, { target, match, order })
      order += 1
      continue
    }

    if (shouldPreferWorkspaceHandoffMatch(match, existing.match)) {
      targetsByQuery.set(key, {
        target,
        match,
        order: existing.order,
      })
    }
  }

  return [...targetsByQuery.values()]
    .sort((left, right) => left.order - right.order)
    .slice(0, limit)
    .map((entry) => entry.target)
}

export function buildAIHistoryWorkspaceRunPrompt(args: {
  targets: readonly AIHistoryWorkspaceHandoffTarget[]
  templatePrompt: string
  seedQuery: string
  scopeLabel?: string | null
}) {
  const mentionTokens = args.targets.map((target) => `@note(${sanitizeWorkspaceHandoffQuery(target.query)})`).join(' ')
  const contextLine = args.scopeLabel?.trim()
    ? `Use the attached notes surfaced from ${args.scopeLabel.trim()}.`
    : 'Use the attached notes surfaced from the current AI history view.'
  const queryLine = args.seedQuery.trim()
    ? `Source retrieval query: "${args.seedQuery.trim()}".`
    : 'Source retrieval query: use the attached notes as the primary signal.'

  return [mentionTokens, '', contextLine, queryLine, '', args.templatePrompt.trim()]
    .filter((part) => part.length > 0)
    .join('\n')
}

function sanitizeWorkspaceHandoffQuery(value: string) {
  return value.replace(/[)\r\n]+/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function resolveAIHistoryWorkspaceHandoffTarget(
  entry: AIHistoryRetrievalCandidate
): AIHistoryWorkspaceHandoffTarget | null {
  const parsed = parseAIDocumentThreadKey(entry.documentKey)
  if (!parsed) return null

  if (parsed.kind === 'path') {
    const pathQuery = parsed.value.includes(')') ? entry.documentName.trim() : parsed.value
    if (!pathQuery) return null

    return {
      documentKey: entry.documentKey,
      query: pathQuery,
      label: entry.documentName,
      detail: parsed.value,
    }
  }

  const draftQuery = entry.documentName.trim()
  if (!draftQuery) return null

  return {
    documentKey: entry.documentKey,
    query: draftQuery,
    label: entry.documentName,
    detail: 'Unsaved draft session',
  }
}

function shouldPreferWorkspaceHandoffMatch<T extends AIHistoryRetrievalCandidate>(
  next: AIHistoryRetrievalMatch<T>,
  current: AIHistoryRetrievalMatch<T>
) {
  if (next.score !== current.score) return next.score > current.score

  const workspaceDelta =
    getAIHistoryWorkspaceExecutionStrength(next.candidate) -
    getAIHistoryWorkspaceExecutionStrength(current.candidate)
  if (workspaceDelta !== 0) return workspaceDelta > 0

  if (next.candidate.pinned !== current.candidate.pinned) return next.candidate.pinned
  return next.candidate.updatedAt > current.candidate.updatedAt
}
