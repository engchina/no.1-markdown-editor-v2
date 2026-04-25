import { extractHeadings } from '../outline.ts'
import { detectDocumentLanguage } from '../documentLanguage.ts'
import type {
  AIApplySnapshot,
  AIContextPacket,
  AIIntent,
  AIOutputTarget,
  AIScope,
  AISelectedTextRole,
} from './types.ts'

const DEFAULT_CONTEXT_WINDOW_CHARS = 400
const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u

export interface AIBuildContextOptions {
  tabId: string
  tabPath: string | null
  fileName?: string
  content: string
  intent: AIIntent
  scope?: AIScope
  outputTarget: AIOutputTarget
  anchorOffset?: number
  selection?: {
    from: number
    to: number
    role?: AISelectedTextRole
  }
  contextWindowChars?: number
}

export function buildAIContextPacket(options: AIBuildContextOptions): AIContextPacket {
  const content = options.content ?? ''
  const selection = normalizeSelection(options.selection, content.length)
  const anchorOffset = clampOffset(selection?.from ?? options.anchorOffset ?? 0, content.length)
  const scope = options.scope ?? (selection ? 'selection' : 'current-block')
  const fileName = resolveFileName(options.fileName, options.tabPath)
  const { beforeText, afterText } = sliceContextWindow(
    content,
    selection?.from ?? anchorOffset,
    selection?.to ?? anchorOffset,
    options.contextWindowChars ?? DEFAULT_CONTEXT_WINDOW_CHARS
  )
  const currentBlock = extractCurrentBlock(content, anchorOffset)
  const headingPath = resolveHeadingPath(content, anchorOffset)
  const frontMatter = extractFrontMatter(content)
  const selectedText = selection ? content.slice(selection.from, selection.to) : undefined

  return {
    tabId: options.tabId,
    tabPath: options.tabPath,
    fileName,
    documentLanguage: detectDocumentLanguage(content),
    intent: options.intent,
    scope,
    outputTarget: options.outputTarget,
    selectedText,
    selectedTextRole: selection?.role ?? (selection ? 'transform-target' : undefined),
    beforeText: beforeText || undefined,
    afterText: afterText || undefined,
    currentBlock: currentBlock || undefined,
    headingPath: headingPath.length > 0 ? headingPath : undefined,
    frontMatter,
  }
}

export function buildAIComposerContextPacket(options: {
  baseContext: AIContextPacket | null
  sourceSnapshot: AIApplySnapshot | null
  intent: AIIntent
  scope: AIScope
  outputTarget: AIOutputTarget
}): AIContextPacket | null {
  const { baseContext, sourceSnapshot, intent, outputTarget } = options
  if (!baseContext) return null

  if (!sourceSnapshot) {
    return {
      ...baseContext,
      intent,
      scope: options.scope,
      outputTarget,
    }
  }

  const hasSelection = sourceSnapshot.selectionFrom !== sourceSnapshot.selectionTo
  const scope = options.scope === 'selection' && !hasSelection ? 'current-block' : options.scope
  const selection =
    scope === 'selection' && hasSelection
      ? {
          from: sourceSnapshot.selectionFrom,
          to: sourceSnapshot.selectionTo,
          role: baseContext.selectedTextRole,
        }
      : undefined
  const context = buildAIContextPacket({
    tabId: baseContext.tabId,
    tabPath: baseContext.tabPath,
    fileName: baseContext.fileName,
    content: sourceSnapshot.docText,
    intent,
    scope,
    outputTarget,
    anchorOffset: sourceSnapshot.anchorOffset,
    selection,
  })

  if (!baseContext.explicitContextAttachments?.length) {
    return {
      ...context,
      ...(baseContext.slashCommandContext ? { slashCommandContext: baseContext.slashCommandContext } : {}),
    }
  }

  return {
    ...context,
    ...(baseContext.slashCommandContext ? { slashCommandContext: baseContext.slashCommandContext } : {}),
    explicitContextAttachments: baseContext.explicitContextAttachments,
  }
}

export function extractFrontMatter(content: string): string | null {
  const match = content.match(FRONT_MATTER_PATTERN)
  return match?.[1]?.trim() ? match[0].trim() : null
}

export function resolveHeadingPath(content: string, offset: number): string[] {
  const currentLine = getLineNumberAtOffset(content, offset)
  const headings = extractHeadings(content)
  const path: string[] = []

  for (const heading of headings) {
    if (heading.line > currentLine) break
    path.splice(Math.max(heading.level - 1, 0))
    path[heading.level - 1] = heading.text
  }

  return path.filter(Boolean)
}

export function resolveCurrentHeadingRange(content: string, offset: number): { from: number; to: number } | null {
  if (!content.trim()) return null

  const currentLine = getLineNumberAtOffset(content, offset)
  const headings = extractHeadings(content)
  if (headings.length === 0) return null

  let activeHeadingIndex = -1
  for (let index = 0; index < headings.length; index += 1) {
    if (headings[index].line <= currentLine) {
      activeHeadingIndex = index
    } else {
      break
    }
  }

  if (activeHeadingIndex === -1) return null

  const activeHeading = headings[activeHeadingIndex]
  const nextHeading = headings
    .slice(activeHeadingIndex + 1)
    .find((heading) => heading.level <= activeHeading.level)

  const from = getOffsetAtLine(content, activeHeading.line)
  const to = nextHeading ? getOffsetAtLine(content, nextHeading.line) : content.length
  return { from, to }
}

export function extractCurrentBlock(content: string, offset: number): string {
  const range = resolveCurrentBlockRange(content, offset)
  if (!range) return ''
  return content.slice(range.from, range.to).trim()
}

export function resolveCurrentBlockRange(content: string, offset: number): { from: number; to: number } | null {
  if (!content) return null
  const lines = content.split(/\r?\n/u)
  const targetLine = getLineNumberAtOffset(content, offset)
  let startLine = targetLine - 1
  let endLine = targetLine - 1

  while (startLine > 0 && lines[startLine - 1]?.trim() !== '') {
    startLine -= 1
  }

  while (endLine < lines.length - 1 && lines[endLine + 1]?.trim() !== '') {
    endLine += 1
  }

  let from = 0
  for (let index = 0; index < startLine; index += 1) {
    from += lines[index].length + 1
  }

  let to = from
  for (let index = startLine; index <= endLine; index += 1) {
    to += lines[index].length
    if (index < lines.length - 1 && index < endLine) to += 1
  }

  return { from, to }
}

export function sliceContextWindow(content: string, from: number, to: number, maxChars: number) {
  const safeFrom = clampOffset(from, content.length)
  const safeTo = clampOffset(Math.max(to, from), content.length)
  const safeWindow = Math.max(0, maxChars)
  const halfWindow = Math.floor(safeWindow / 2)

  const beforeStart = Math.max(0, safeFrom - halfWindow)
  const afterEnd = Math.min(content.length, safeTo + halfWindow)

  return {
    beforeText: content.slice(beforeStart, safeFrom).trim(),
    afterText: content.slice(safeTo, afterEnd).trim(),
  }
}

export function getLineNumberAtOffset(content: string, offset: number): number {
  const safeOffset = clampOffset(offset, content.length)
  let line = 1
  for (let index = 0; index < safeOffset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1
  }
  return line
}

export function getOffsetAtLine(content: string, lineNumber: number): number {
  const safeLineNumber = Math.max(1, Math.trunc(lineNumber))
  const lines = content.split(/\r?\n/u)
  const targetIndex = Math.min(safeLineNumber - 1, Math.max(lines.length - 1, 0))
  let offset = 0

  for (let index = 0; index < targetIndex; index += 1) {
    offset += lines[index].length + 1
  }

  return offset
}

function normalizeSelection(
  selection: AIBuildContextOptions['selection'],
  contentLength: number
): { from: number; to: number; role?: AISelectedTextRole } | null {
  if (!selection) return null
  const from = clampOffset(selection.from, contentLength)
  const to = clampOffset(selection.to, contentLength)
  if (from === to) return null

  return {
    from: Math.min(from, to),
    to: Math.max(from, to),
    role: selection.role,
  }
}

function resolveFileName(fileName: string | undefined, tabPath: string | null): string {
  if (fileName?.trim()) return fileName.trim()
  const fromPath = tabPath?.split(/[\\/]/u).pop()?.trim()
  return fromPath || 'Untitled'
}

function clampOffset(value: number, contentLength: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(Math.trunc(value), 0), contentLength)
}

