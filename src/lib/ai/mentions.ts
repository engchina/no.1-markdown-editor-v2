import {
  buildWorkspaceSearchResults,
  findWorkspaceDocumentReference,
  type WorkspaceSearchResult,
  type WorkspaceSearchableTab,
} from '../workspaceSearch.ts'
import type {
  AIApplySnapshot,
  AIContextPacket,
  AIExplicitContextAttachment,
  AIPromptMention,
  AIPromptMentionErrorCode,
  AIPromptMentionResolution,
} from './types'

const NOTE_ATTACHMENT_MAX_CHARS = 12000
const SEARCH_RESULTS_LIMIT = 5
const MENTION_PATTERN = /@(note|search)(?:\(([^)]*)\))?/giu

export function parseAIPromptMentions(prompt: string): {
  cleanPrompt: string
  mentions: AIPromptMention[]
} {
  const source = prompt ?? ''
  const mentions: AIPromptMention[] = []
  MENTION_PATTERN.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = MENTION_PATTERN.exec(source))) {
    const index = match.index
    const previousCharacter = index > 0 ? source[index - 1] : ''
    if (previousCharacter && !/\s|\(/u.test(previousCharacter)) continue

    const kind = match[1] as AIPromptMention['kind']
    const query = typeof match[2] === 'string' ? match[2].trim() || null : null
    mentions.push({
      id: `${kind}:${query ?? 'current'}:${index}`,
      kind,
      query,
      raw: match[0],
      index,
    })
  }

  if (mentions.length === 0) {
    return {
      cleanPrompt: source.trim(),
      mentions: [],
    }
  }

  let cursor = 0
  const parts: string[] = []

  for (const mention of mentions) {
    parts.push(source.slice(cursor, mention.index))
    cursor = mention.index + mention.raw.length
  }

  parts.push(source.slice(cursor))

  return {
    cleanPrompt: normalizePromptAfterMentionRemoval(parts.join('')),
    mentions,
  }
}

export async function resolveAIPromptMentions(options: {
  mentions: AIPromptMention[]
  baseContext: AIContextPacket | null
  sourceSnapshot: AIApplySnapshot | null
  tabs: WorkspaceSearchableTab[]
  rootPath: string | null
}): Promise<AIPromptMentionResolution[]> {
  const dedupedMentions = dedupePromptMentions(options.mentions)
  const results: AIPromptMentionResolution[] = []

  for (const mention of dedupedMentions) {
    switch (mention.kind) {
      case 'note':
        results.push(await resolveNoteMention(mention, options))
        break
      case 'search':
        results.push(await resolveSearchMention(mention, options))
        break
    }
  }

  return results
}

export function attachAIPromptMentionContext(
  context: AIContextPacket | null,
  resolutions: AIPromptMentionResolution[]
): AIContextPacket | null {
  if (!context) return null

  const explicitContextAttachments = resolutions
    .filter((resolution): resolution is AIPromptMentionResolution & { attachment: AIExplicitContextAttachment } =>
      resolution.status === 'resolved' && !!resolution.attachment
    )
    .map((resolution) => resolution.attachment)

  if (explicitContextAttachments.length === 0) {
    return context
  }

  return {
    ...context,
    explicitContextAttachments,
  }
}

function dedupePromptMentions(mentions: AIPromptMention[]): AIPromptMention[] {
  const seen = new Set<string>()
  const uniqueMentions: AIPromptMention[] = []

  for (const mention of mentions) {
    const key = `${mention.kind}:${normalizeMentionQuery(mention.query)}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueMentions.push(mention)
  }

  return uniqueMentions
}

async function resolveNoteMention(
  mention: AIPromptMention,
  options: {
    baseContext: AIContextPacket | null
    sourceSnapshot: AIApplySnapshot | null
    tabs: WorkspaceSearchableTab[]
    rootPath: string | null
  }
): Promise<AIPromptMentionResolution> {
  if (!mention.query) {
    const fileName = options.baseContext?.fileName ?? 'Untitled'
    const snapshotText = options.sourceSnapshot?.docText?.trim() ?? ''

    if (!snapshotText) {
      return buildMentionError(mention, 'note-not-found')
    }

    const clipped = clipMentionContent(snapshotText, NOTE_ATTACHMENT_MAX_CHARS)
    return {
      mention,
      status: 'resolved',
      attachment: {
        id: `note:current:${options.baseContext?.tabId ?? 'unknown'}`,
        kind: 'note',
        label: fileName,
        detail: options.baseContext?.tabPath ?? fileName,
        content: clipped.content,
        truncated: clipped.truncated,
      },
    }
  }

  const reference = await findWorkspaceDocumentReference({
    query: mention.query,
    tabs: options.tabs,
    rootPath: options.rootPath,
  })

  if (!reference) {
    return buildMentionError(mention, 'note-not-found')
  }

  const clipped = clipMentionContent(reference.content, NOTE_ATTACHMENT_MAX_CHARS)
  return {
    mention,
    status: 'resolved',
    attachment: {
      id: `note:${reference.source}:${reference.path ?? reference.tabId ?? reference.name}`,
      kind: 'note',
      label: reference.name,
      detail: reference.path ?? reference.name,
      content: clipped.content,
      query: mention.query,
      truncated: clipped.truncated,
    },
  }
}

async function resolveSearchMention(
  mention: AIPromptMention,
  options: {
    tabs: WorkspaceSearchableTab[]
    rootPath: string | null
  }
): Promise<AIPromptMentionResolution> {
  const query = mention.query?.trim() ?? ''
  if (!query) {
    return buildMentionError(mention, 'search-empty-query')
  }

  let results: WorkspaceSearchResult[]
  try {
    results = await buildWorkspaceSearchResults({
      query,
      tabs: options.tabs,
      rootPath: options.rootPath,
      limit: SEARCH_RESULTS_LIMIT,
    })
  } catch {
    return buildMentionError(mention, 'search-no-results')
  }

  if (results.length === 0) {
    return buildMentionError(mention, 'search-no-results')
  }

  return {
    mention,
    status: 'resolved',
    attachment: {
      id: `search:${query.toLowerCase()}`,
      kind: 'search',
      label: query,
      detail: formatSearchAttachmentDetail(results),
      content: formatSearchAttachmentContent(query, results),
      query,
    },
  }
}

function clipMentionContent(content: string, maxChars: number): {
  content: string
  truncated: boolean
} {
  const normalized = content.trim()
  if (normalized.length <= maxChars) {
    return {
      content: normalized,
      truncated: false,
    }
  }

  return {
    content: normalized.slice(0, maxChars).trimEnd(),
    truncated: true,
  }
}

function formatSearchAttachmentDetail(results: WorkspaceSearchResult[]): string {
  const distinctFiles = new Set(
    results.map((result) => result.path ?? result.name)
  )

  return `${results.length} hits across ${distinctFiles.size} note${distinctFiles.size === 1 ? '' : 's'}`
}

function formatSearchAttachmentContent(query: string, results: WorkspaceSearchResult[]): string {
  const lines = [`Workspace search for "${query}":`, '']

  for (const result of results) {
    const location = `${result.name}:${result.line}`
    const scope = result.path ? ` (${result.path})` : ''
    lines.push(`- ${location}${scope}`)
    lines.push(`  ${result.text}`)
  }

  return lines.join('\n').trim()
}

function buildMentionError(
  mention: AIPromptMention,
  errorCode: AIPromptMentionErrorCode
): AIPromptMentionResolution {
  return {
    mention,
    status: 'error',
    errorCode,
  }
}

function normalizePromptAfterMentionRemoval(value: string): string {
  return value
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n[ \t]+/gu, '\n')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\s+([,.;!?])/gu, '$1')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function normalizeMentionQuery(value: string | null): string {
  return (value ?? '').trim().replace(/\s+/gu, ' ').toLowerCase()
}
