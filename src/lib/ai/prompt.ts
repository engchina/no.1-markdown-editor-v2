import type {
  AIContextPacket,
  AIOutputTarget,
  AIRequestMessage,
  AIRunCompletionRequest,
} from './types.ts'

export function buildAIRequestMessages(request: Pick<AIRunCompletionRequest, 'prompt' | 'context'>): AIRequestMessage[] {
  const systemPrompt = buildAISystemPrompt(request.context)
  const userPrompt = buildAIUserPrompt(request.prompt, request.context)

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

export function normalizeAIDraftText(text: string, outputTarget: AIOutputTarget): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (outputTarget === 'chat-only') return trimmed

  const fencedMatch = trimmed.match(/^```(?:markdown|md)\s*\r?\n([\s\S]*?)\r?\n```$/iu)
  const normalized = fencedMatch ? fencedMatch[1].trim() : trimmed
  return normalizeMarkdownDraftText(normalized)
}

function buildAISystemPrompt(context: AIContextPacket): string {
  const lines = [
    'You are an AI writing assistant inside a Markdown editor.',
    'Preserve Markdown structure and formatting unless the user explicitly asks to change it.',
    'Return standards-compliant Markdown whenever your response is meant to be inserted into or read as Markdown content.',
    'Use valid Markdown block syntax, including required spacing for ATX headings.',
    'Do not wrap your response in ```markdown fences.',
    'Keep links, tables, headings, fenced code blocks, Mermaid blocks, math, and front matter safe.',
    context.explicitContextAttachments?.length
      ? 'Use only the explicit attached note, heading, and search context shown below. Do not assume any hidden workspace state.'
      : 'Do not assume access to any hidden workspace state beyond the visible attached context.',
    context.outputTarget === 'chat-only'
      ? 'When answering in chat-only mode, be concise, directly useful, and use Markdown formatting when it improves readability.'
      : context.outputTarget === 'new-note'
        ? 'Return only the Markdown content for a self-contained new note.'
      : 'Return only the content that should be inserted into the document.',
  ]

  switch (context.intent) {
    case 'ask':
      lines.push('Answer the user question clearly without rewriting unrelated content.')
      break
    case 'edit':
      lines.push('Edit only the intended target text or block and keep surrounding structure stable.')
      break
    case 'generate':
      lines.push('Generate content that fits naturally at the requested insertion point.')
      break
    case 'review':
      lines.push('Review the content and point out issues, risks, and concrete improvements.')
      break
  }

  if (context.documentLanguage !== 'mixed') {
    lines.push(`The document language is primarily ${context.documentLanguage}.`)
  }

  if (context.selectedTextRole === 'reference-only') {
    lines.push('Selected text is reference-only context and should not be treated as the rewrite target unless the user explicitly asks.')
  }

  return lines.join('\n')
}

function buildAIUserPrompt(prompt: string, context: AIContextPacket): string {
  const sections = [
    `User instruction:\n${prompt.trim()}`,
    `Intent: ${context.intent}`,
    `Scope: ${context.scope}`,
    `Output target: ${context.outputTarget}`,
  ]

  if (context.fileName) sections.push(`File: ${context.fileName}`)
  if (context.headingPath?.length) sections.push(`Heading path:\n${context.headingPath.join(' > ')}`)
  if (context.frontMatter) sections.push(`Front matter:\n${context.frontMatter}`)
  if (context.beforeText) sections.push(`Before context:\n${context.beforeText}`)
  if (context.selectedText) {
    sections.push(
      `Selected text (${context.selectedTextRole ?? 'transform-target'}):\n${context.selectedText}`
    )
  }
  if (context.currentBlock) sections.push(`Current block:\n${context.currentBlock}`)
  if (context.afterText) sections.push(`After context:\n${context.afterText}`)
  if (context.explicitContextAttachments?.length) {
    for (const attachment of context.explicitContextAttachments) {
      const descriptor =
        attachment.kind === 'note'
          ? 'Attached note'
          : attachment.kind === 'heading'
            ? 'Attached heading section'
            : 'Attached workspace search'
      const truncatedSuffix = attachment.truncated ? ' (truncated)' : ''
      const querySuffix = attachment.query ? ` [query: ${attachment.query}]` : ''

      sections.push(
        `${descriptor}${truncatedSuffix}: ${attachment.label}${querySuffix}\n${attachment.content}`
      )
    }
  }

  return sections.join('\n\n')
}

function normalizeMarkdownDraftText(text: string): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/u)
  const normalizedLines: string[] = []
  let activeFence: { marker: '`' | '~'; length: number } | null = null

  for (const line of lines) {
    const fence = parseMarkdownFence(line)

    if (activeFence) {
      normalizedLines.push(line)
      if (
        fence &&
        fence.marker === activeFence.marker &&
        fence.length >= activeFence.length &&
        fence.rest.trim().length === 0
      ) {
        activeFence = null
      }
      continue
    }

    if (fence) {
      activeFence = { marker: fence.marker, length: fence.length }
      normalizedLines.push(line)
      continue
    }

    normalizedLines.push(normalizeMarkdownHeadingSpacing(line))
  }

  return normalizedLines.join(newline)
}

function parseMarkdownFence(line: string): { marker: '`' | '~'; length: number; rest: string } | null {
  const match = line.match(/^\s{0,3}([`~]{3,})(.*)$/u)
  if (!match) return null

  const fence = match[1] ?? ''
  const marker = fence[0]
  if ((marker !== '`' && marker !== '~') || !fence.split('').every((char) => char === marker)) {
    return null
  }

  return {
    marker,
    length: fence.length,
    rest: match[2] ?? '',
  }
}

function normalizeMarkdownHeadingSpacing(line: string): string {
  return line.replace(/^(\s{0,3})(#{1,6})(?!#)(\S.*)$/u, '$1$2 $3')
}
