import { getWorkspaceAssetReferences, type WorkspaceIndexSnapshot } from './workspaceIndex/index.ts'

export interface WorkspaceAssetRepairUpdate {
  documentPath: string
  documentName: string
  source: string
  replacement: string
  line: number
  sourceStart: number
  sourceEnd: number
}

export interface WorkspaceAssetRepairDocumentPlan {
  documentPath: string
  documentName: string
  updates: WorkspaceAssetRepairUpdate[]
}

export function buildWorkspaceAssetRepairPlan(
  snapshot: WorkspaceIndexSnapshot,
  oldPath: string,
  newPath: string
): WorkspaceAssetRepairDocumentPlan[] {
  const normalizedOldPath = normalizeWorkspacePath(oldPath)
  const normalizedNewPath = normalizeWorkspacePath(newPath)
  if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) return []

  const documents = new Map<string, WorkspaceAssetRepairDocumentPlan>()

  for (const reference of getWorkspaceAssetReferences(snapshot)) {
    if (!reference.local || !reference.resolvedPath) continue

    const normalizedResolvedPath = normalizeWorkspacePath(reference.resolvedPath)
    const nextResolvedPath = remapWorkspacePathPrefix(normalizedResolvedPath, normalizedOldPath, normalizedNewPath)
    if (!nextResolvedPath) continue

    const { suffix } = splitAssetReferenceSource(reference.source)
    const replacement = `${buildRelativeWorkspaceAssetPath(reference.documentPath, nextResolvedPath)}${suffix}`
    if (!replacement || replacement === reference.source) continue

    const documentKey = normalizeWorkspacePath(reference.documentPath)
    const existing = documents.get(documentKey)
    const update: WorkspaceAssetRepairUpdate = {
      documentPath: reference.documentPath,
      documentName: reference.documentName,
      source: reference.source,
      replacement,
      line: reference.line,
      sourceStart: reference.sourceStart,
      sourceEnd: reference.sourceEnd,
    }

    if (existing) {
      existing.updates.push(update)
      continue
    }

    documents.set(documentKey, {
      documentPath: reference.documentPath,
      documentName: reference.documentName,
      updates: [update],
    })
  }

  return Array.from(documents.values())
    .map((entry) => ({
      ...entry,
      updates: [...entry.updates].sort((left, right) => {
        if (left.sourceStart !== right.sourceStart) return right.sourceStart - left.sourceStart
        if (left.line !== right.line) return right.line - left.line
        return right.source.length - left.source.length
      }),
    }))
    .sort((left, right) => left.documentPath.localeCompare(right.documentPath))
}

export function countWorkspaceAssetRepairPlanReferences(
  plan: readonly WorkspaceAssetRepairDocumentPlan[]
): number {
  return plan.reduce((total, entry) => total + entry.updates.length, 0)
}

export function rewriteWorkspaceAssetReferences(
  content: string,
  updates: readonly Pick<WorkspaceAssetRepairUpdate, 'source' | 'replacement' | 'line' | 'sourceStart' | 'sourceEnd'>[]
): string | null {
  let nextContent = content

  for (const update of updates) {
    const rewritten = rewriteWorkspaceAssetReference(nextContent, update)
    if (rewritten === null) return null
    nextContent = rewritten
  }

  return nextContent
}

function rewriteWorkspaceAssetReference(
  content: string,
  update: Pick<WorkspaceAssetRepairUpdate, 'source' | 'replacement' | 'line' | 'sourceStart' | 'sourceEnd'>
): string | null {
  if (
    update.sourceStart >= 0 &&
    update.sourceEnd > update.sourceStart &&
    content.slice(update.sourceStart, update.sourceEnd) === update.source
  ) {
    return `${content.slice(0, update.sourceStart)}${update.replacement}${content.slice(update.sourceEnd)}`
  }

  const lineBreak = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/u)
  const targetLine = lines[update.line - 1]
  if (targetLine === undefined) return null

  const sourceIndex = targetLine.lastIndexOf(update.source)
  if (sourceIndex < 0) return null

  lines[update.line - 1] = `${targetLine.slice(0, sourceIndex)}${update.replacement}${targetLine.slice(sourceIndex + update.source.length)}`
  return lines.join(lineBreak)
}

function buildRelativeWorkspaceAssetPath(documentPath: string, targetPath: string): string {
  const from = splitNormalizedPath(getDirectoryPath(documentPath))
  const to = splitNormalizedPath(targetPath)

  if (from.prefix !== to.prefix || from.absolute !== to.absolute) {
    return normalizeWorkspacePath(targetPath)
  }

  let commonLength = 0
  while (
    commonLength < from.segments.length &&
    commonLength < to.segments.length &&
    from.segments[commonLength] === to.segments[commonLength]
  ) {
    commonLength += 1
  }

  const upwardSegments = new Array(from.segments.length - commonLength).fill('..')
  const downwardSegments = to.segments.slice(commonLength)
  const relativeSegments = [...upwardSegments, ...downwardSegments]
  const relativePath = relativeSegments.join('/')

  if (relativePath.length === 0) {
    return `./${getPathBaseName(targetPath)}`
  }

  return relativePath.startsWith('..') ? relativePath : `./${relativePath}`
}

function getDirectoryPath(path: string): string {
  const normalized = normalizeWorkspacePath(path)
  const separatorIndex = normalized.lastIndexOf('/')
  return separatorIndex === -1 ? '' : normalized.slice(0, separatorIndex)
}

function getPathBaseName(path: string): string {
  const normalized = normalizeWorkspacePath(path)
  const separatorIndex = normalized.lastIndexOf('/')
  return separatorIndex === -1 ? normalized : normalized.slice(separatorIndex + 1)
}

function remapWorkspacePathPrefix(path: string, oldPrefix: string, newPrefix: string): string | null {
  if (path === oldPrefix) return newPrefix
  if (!path.startsWith(oldPrefix)) return null

  const suffix = path.slice(oldPrefix.length)
  if (!suffix) return newPrefix
  if (!suffix.startsWith('/')) return null
  return `${newPrefix}${suffix}`
}

function splitAssetReferenceSource(source: string): { pathSource: string; suffix: string } {
  const hashIndex = source.indexOf('#')
  const queryIndex = source.indexOf('?')
  const suffixStart =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex)

  if (suffixStart === -1) {
    return {
      pathSource: source,
      suffix: '',
    }
  }

  return {
    pathSource: source.slice(0, suffixStart),
    suffix: source.slice(suffixStart),
  }
}

function normalizeWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/gu, '/')
  const segments = normalized.split('/')
  const stack: string[] = []
  const absolute = normalized.startsWith('/')
  const drivePrefix = segments[0]?.endsWith(':') ? segments.shift() ?? '' : ''

  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (stack.length > 0) {
        stack.pop()
      }
      continue
    }
    stack.push(segment)
  }

  const prefix = drivePrefix ? `${drivePrefix}/` : absolute ? '/' : ''
  return `${prefix}${stack.join('/')}`.replace(/\/+$/u, '')
}

function splitNormalizedPath(path: string): { prefix: string; absolute: boolean; segments: string[] } {
  const normalized = normalizeWorkspacePath(path)
  const segments = normalized.split('/').filter(Boolean)
  const absolute = normalized.startsWith('/')
  const prefix = segments[0]?.endsWith(':') ? segments.shift() ?? '' : ''

  return {
    prefix,
    absolute,
    segments,
  }
}
