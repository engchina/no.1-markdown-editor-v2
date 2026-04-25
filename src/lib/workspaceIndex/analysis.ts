import { MARKDOWN_FILE_EXTENSIONS, isLikelyWorkspaceAssetFileName, isSupportedDocumentName } from '../fileTypes.ts'
import { extractHeadings } from '../outline.ts'
import { buildWorkspaceDiagnostics } from './diagnostics.ts'
import type {
  WorkspaceIndexAsset,
  WorkspaceIndexDocument,
  WorkspaceIndexFrontMatterSummary,
  WorkspaceIndexLink,
} from './types.ts'

const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u
const FRONT_MATTER_KEY_PATTERN = /^[ \t]*([A-Za-z0-9_-]+)\s*:/gmu
const MARKDOWN_LINK_PATTERN = /(?<!!)\[[^\]]*\]\(([^)]+)\)/gu
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/gu
const HTML_IMAGE_PATTERN = /<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/giu
const WIKILINK_PATTERN = /\[\[([^[\]|]+)(?:\|[^[]+)?\]\]/gu
const HTML_ALT_PATTERN = /\balt=(["'])(.*?)\1/iu

export function buildWorkspaceIndexDocument(path: string, content: string): WorkspaceIndexDocument {
  const name = deriveWorkspaceDocumentName(path)
  const headings = extractHeadings(content)
  const title = headings[0]?.text ?? stripMarkdownExtension(name)
  const links = extractWorkspaceLinks(content)
  const assets = extractWorkspaceAssets(content)
  const frontMatter = extractWorkspaceFrontMatter(content)
  const diagnostics = buildWorkspaceDiagnostics(content, headings, assets, frontMatter)

  return {
    path,
    name,
    title,
    headings,
    links,
    assets,
    frontMatter,
    diagnostics,
  }
}

export function deriveWorkspaceDocumentName(path: string): string {
  const normalized = path.replace(/\\/gu, '/')
  return normalized.split('/').pop() ?? normalized
}

export function extractWorkspaceLinks(content: string): WorkspaceIndexLink[] {
  const links: Array<WorkspaceIndexLink & { index: number }> = []

  collectPatternMatches(MARKDOWN_LINK_PATTERN, content, (match) => {
    const rawTarget = match[1] ?? ''
    const target = normalizeMarkdownLinkTarget(rawTarget)
    if (!target) return
    const sourceRange = resolveMarkdownTargetRange(rawTarget)
    if (!sourceRange) return
    const rawTargetIndex = (match[0] ?? '').indexOf(rawTarget)
    if (rawTargetIndex < 0) return
    const index = match.index ?? 0
    const line = getLineNumberAtOffset(content, index)
    links.push({
      target,
      kind: 'markdown',
      local: isLocalTarget(target),
      line,
      sourceStart: index + rawTargetIndex + sourceRange.start,
      sourceEnd: index + rawTargetIndex + sourceRange.end,
      index,
    })
  })

  collectPatternMatches(WIKILINK_PATTERN, content, (match) => {
    const rawTarget = match[1] ?? ''
    const target = normalizeWikiLinkTarget(rawTarget)
    if (!target) return
    const index = match.index ?? 0
    const line = getLineNumberAtOffset(content, index)
    links.push({
      target,
      kind: 'wikilink',
      local: true,
      line,
      sourceStart: index + 2,
      sourceEnd: index + 2 + rawTarget.length,
      index,
    })
  })

  return dedupeLinkEntries(
    links
      .sort((left, right) => left.index - right.index)
      .map(({ index: _index, ...link }) => link)
  )
}

export function extractWorkspaceAssets(content: string): WorkspaceIndexAsset[] {
  const assets: Array<WorkspaceIndexAsset & { index: number }> = []

  collectPatternMatches(MARKDOWN_IMAGE_PATTERN, content, (match) => {
    const altText = match[1]?.trim() ?? ''
    const rawTarget = match[2] ?? ''
    const source = normalizeMarkdownLinkTarget(rawTarget)
    if (!source) return
    const sourceRange = resolveMarkdownTargetRange(rawTarget)
    if (!sourceRange) return

    const rawTargetIndex = (match[0] ?? '').indexOf(rawTarget)
    if (rawTargetIndex < 0) return
    const index = match.index ?? 0
    const line = getLineNumberAtOffset(content, index)
    assets.push({
      source,
      kind: 'markdown-image',
      local: isLocalTarget(source),
      line,
      altText,
      sourceStart: index + rawTargetIndex + sourceRange.start,
      sourceEnd: index + rawTargetIndex + sourceRange.end,
      index,
    })
  })

  collectPatternMatches(HTML_IMAGE_PATTERN, content, (match) => {
    const source = match[2]?.trim() ?? ''
    if (!source) return
    const index = match.index ?? 0
    const line = getLineNumberAtOffset(content, index)
    const fullTag = match[0] ?? ''
    const sourceIndex = fullTag.indexOf(source)
    if (sourceIndex < 0) return
    const altText = HTML_ALT_PATTERN.exec(fullTag)?.[2]?.trim() ?? ''
    HTML_ALT_PATTERN.lastIndex = 0
    assets.push({
      source,
      kind: 'html-image',
      local: isLocalTarget(source),
      line,
      altText,
      sourceStart: index + sourceIndex,
      sourceEnd: index + sourceIndex + source.length,
      index,
    })
  })

  collectPatternMatches(MARKDOWN_LINK_PATTERN, content, (match) => {
    const rawTarget = match[1] ?? ''
    const source = normalizeMarkdownLinkTarget(rawTarget)
    if (!source || !isWorkspaceAttachmentTarget(source)) return
    const sourceRange = resolveMarkdownTargetRange(rawTarget)
    if (!sourceRange) return

    const rawTargetIndex = (match[0] ?? '').indexOf(rawTarget)
    if (rawTargetIndex < 0) return
    const index = match.index ?? 0
    const line = getLineNumberAtOffset(content, index)
    assets.push({
      source,
      kind: 'markdown-attachment',
      local: isLocalTarget(source),
      line,
      altText: null,
      sourceStart: index + rawTargetIndex + sourceRange.start,
      sourceEnd: index + rawTargetIndex + sourceRange.end,
      index,
    })
  })

  return assets
    .sort((left, right) => left.index - right.index)
    .map(({ index: _index, ...asset }) => asset)
}

export function extractWorkspaceFrontMatter(content: string): WorkspaceIndexFrontMatterSummary | null {
  const match = content.match(FRONT_MATTER_PATTERN)
  if (!match) return null

  const raw = match[1]?.trim() ?? ''
  if (!raw) {
    return {
      raw,
      keys: [],
    }
  }

  const keys = Array.from(raw.matchAll(FRONT_MATTER_KEY_PATTERN)).map((entry) => entry[1])
  return {
    raw,
    keys,
  }
}

export function isWorkspaceDocumentPath(path: string): boolean {
  return isSupportedDocumentName(deriveWorkspaceDocumentName(path))
}

function normalizeMarkdownLinkTarget(raw: string): string {
  const value = raw.trim()
  if (!value) return ''

  if (value.startsWith('<')) {
    const closingIndex = value.indexOf('>')
    if (closingIndex > 1) return value.slice(1, closingIndex).trim()
  }

  const token = value.match(/^\S+/u)?.[0] ?? value
  return token.replace(/^<|>$/gu, '').trim()
}

function normalizeWikiLinkTarget(raw: string): string {
  return raw.trim()
}

function isLocalTarget(target: string): boolean {
  const value = target.trim()
  if (!value || value.startsWith('#') || value.startsWith('//')) return false
  if (/^(?:https?|mailto|tel|data):/iu.test(value)) return false
  return true
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.(md|markdown|mdx|txt)$/iu, '')
}

function dedupeLinkEntries(links: WorkspaceIndexLink[]): WorkspaceIndexLink[] {
  const seen = new Set<string>()
  return links.filter((link) => {
    const key = `${link.kind}:${link.target}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function collectPatternMatches(
  pattern: RegExp,
  content: string,
  onMatch: (match: RegExpExecArray) => void
): void {
  pattern.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = pattern.exec(content))) {
    onMatch(match)
  }
}

function getLineNumberAtOffset(content: string, offset: number): number {
  let line = 1
  const clampedOffset = Math.max(0, Math.min(offset, content.length))

  for (let index = 0; index < clampedOffset; index += 1) {
    if (content[index] === '\n') line += 1
  }

  return line
}

function resolveMarkdownTargetRange(rawTarget: string): { start: number; end: number } | null {
  const trimmedStart = rawTarget.match(/\S/u)?.index ?? -1
  if (trimmedStart < 0) return null

  if (rawTarget[trimmedStart] === '<') {
    const closingIndex = rawTarget.indexOf('>', trimmedStart + 1)
    if (closingIndex <= trimmedStart + 1) return null
    return {
      start: trimmedStart + 1,
      end: closingIndex,
    }
  }

  const token = rawTarget.slice(trimmedStart).match(/^\S+/u)?.[0] ?? ''
  if (!token) return null
  return {
    start: trimmedStart,
    end: trimmedStart + token.length,
  }
}

function isWorkspaceAttachmentTarget(target: string): boolean {
  const value = target.trim()
  if (!value || value.startsWith('#')) return false
  if (/^(?:mailto|tel|data|blob):/iu.test(value)) return false

  const pathTarget = stripQueryAndHash(value)
  if (!pathTarget || isWorkspaceDocumentLikeTarget(pathTarget)) return false

  return isLikelyWorkspaceAssetFileName(deriveWorkspaceDocumentName(pathTarget))
}

function isWorkspaceDocumentLikeTarget(target: string): boolean {
  const extension = getFileExtension(stripQueryAndHash(target))
  if (!extension) return false
  return MARKDOWN_FILE_EXTENSIONS.includes(extension as (typeof MARKDOWN_FILE_EXTENSIONS)[number])
}

function getFileExtension(path: string): string | null {
  const match = path.match(/\.([A-Za-z0-9]+)$/u)
  return match?.[1]?.toLowerCase() ?? null
}

function stripQueryAndHash(value: string): string {
  return value.split('#', 1)[0]?.split('?', 1)[0]?.trim() ?? ''
}
