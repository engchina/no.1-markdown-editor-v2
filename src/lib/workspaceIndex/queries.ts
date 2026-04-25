import { slugifyHeading } from '../outline.ts'
import { MARKDOWN_FILE_EXTENSIONS } from '../fileTypes.ts'
import { isLikelyAttachmentFileName } from '../fileTypes.ts'
import { isLikelyImageFileName } from '../fileTypes.ts'
import { isLikelyWorkspaceAssetFileName } from '../fileTypes.ts'
import type {
  WorkspaceIndexAsset,
  WorkspaceIndexDiagnostic,
  WorkspaceIndexDocument,
  WorkspaceIndexLink,
  WorkspaceIndexSnapshot,
} from './types.ts'

export interface WorkspaceResolvedDocumentLink {
  sourcePath: string
  sourceName: string
  target: string
  kind: WorkspaceIndexLink['kind']
  line: number
  sourceStart: number
  sourceEnd: number
  anchor: string | null
  resolvedPath: string | null
  resolvedName: string | null
  resolvedHeadingLine: number | null
  resolvedHeadingText: string | null
  broken: boolean
  ambiguous: boolean
}

export interface WorkspaceBacklink {
  sourcePath: string
  sourceName: string
  target: string
  kind: WorkspaceIndexLink['kind']
  line: number
}

export interface WorkspaceDocumentLinkRepairCandidate {
  path: string
  name: string
  replacementTarget: string
  score: number
  headingText: string | null
}

export interface WorkspaceUnlinkedMention {
  sourcePath: string
  sourceName: string
  line: number
  matchedText: string
  excerpt: string
}

export interface WorkspaceResolvedAssetReference {
  documentPath: string
  documentName: string
  source: string
  kind: WorkspaceIndexAsset['kind']
  line: number
  local: boolean
  resolvedPath: string | null
  missing: boolean
  sourceStart: number
  sourceEnd: number
}

export interface WorkspaceOrphanedAsset {
  path: string
  name: string
  kind: 'image' | 'attachment'
}

export interface WorkspaceAssetRepairCandidate {
  path: string
  name: string
  relativeSource: string
  score: number
}

export interface WorkspaceHealthFinding {
  documentPath: string
  documentName: string
  kind: WorkspaceIndexDiagnostic['kind'] | 'broken-link' | 'missing-asset'
  message: string
  line: number
  heading?: string
  subject?: string
  relatedLine?: number
  detail?: WorkspaceIndexDiagnostic['detail']
}

export function getWorkspaceOutgoingDocumentLinks(
  snapshot: WorkspaceIndexSnapshot,
  documentPath: string
): WorkspaceResolvedDocumentLink[] {
  const document = getWorkspaceDocument(snapshot, documentPath)
  if (!document) return []

  const context = buildWorkspaceResolutionContext(snapshot)
  const outgoingLinks: WorkspaceResolvedDocumentLink[] = []

  for (const link of document.links) {
    if (!link.local) continue
    if (!isDocumentLikeLink(link)) continue

    const resolution = resolveDocumentLink(link, document, context)
    outgoingLinks.push({
      sourcePath: document.path,
      sourceName: document.name,
      target: link.target,
      kind: link.kind,
      line: link.line,
      sourceStart: link.sourceStart,
      sourceEnd: link.sourceEnd,
      anchor: resolution.anchor,
      resolvedPath: resolution.resolvedPath,
      resolvedName: resolution.resolvedName,
      resolvedHeadingLine: resolution.resolvedHeadingLine,
      resolvedHeadingText: resolution.resolvedHeadingText,
      broken: resolution.resolvedPath === null,
      ambiguous: resolution.ambiguous,
    })
  }

  return outgoingLinks
}

export function getWorkspaceBacklinks(
  snapshot: WorkspaceIndexSnapshot,
  targetPath: string
): WorkspaceBacklink[] {
  const normalizedTargetPath = normalizeWorkspacePath(targetPath)
  const backlinks: WorkspaceBacklink[] = []

  for (const document of snapshot.documents) {
    for (const link of getWorkspaceOutgoingDocumentLinks(snapshot, document.path)) {
      if (link.resolvedPath !== normalizedTargetPath) continue

      backlinks.push({
        sourcePath: link.sourcePath,
        sourceName: link.sourceName,
        target: link.target,
        kind: link.kind,
        line: link.line,
      })
    }
  }

  return backlinks.sort((left, right) => {
    if (left.sourcePath !== right.sourcePath) return left.sourcePath.localeCompare(right.sourcePath)
    return left.line - right.line
  })
}

export async function getWorkspaceUnlinkedMentions(
  snapshot: WorkspaceIndexSnapshot,
  targetPath: string,
  loadDocumentContent: (documentPath: string) => Promise<string | null>
): Promise<WorkspaceUnlinkedMention[]> {
  const normalizedTargetPath = normalizeWorkspacePath(targetPath)
  const targetDocument = getWorkspaceDocument(snapshot, targetPath)
  if (!targetDocument) return []

  const candidateTexts = Array.from(
    new Set(
      [targetDocument.title, stripMarkdownExtension(targetDocument.name)]
        .map((value) => value.trim())
        .filter((value) => normalizeLookupValue(value).length >= 2)
    )
  )
  if (candidateTexts.length === 0) return []

  const mentionEntries: WorkspaceUnlinkedMention[] = []
  for (const document of snapshot.documents) {
    if (normalizeWorkspacePath(document.path) === normalizedTargetPath) continue

    const linkedLines = new Set(
      getWorkspaceOutgoingDocumentLinks(snapshot, document.path)
        .filter((link) => link.resolvedPath === normalizedTargetPath)
        .map((link) => link.line)
    )

    const content = await loadDocumentContent(document.path)
    if (!content) continue

    const lines = content.split(/\r?\n/u)
    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1
      if (linkedLines.has(lineNumber)) continue

      const excerpt = lines[index]?.trim() ?? ''
      if (!excerpt) continue

      const normalizedExcerpt = normalizeLookupValue(excerpt)
      const matchedText = candidateTexts.find((value) => normalizedExcerpt.includes(normalizeLookupValue(value)))
      if (!matchedText) continue

      mentionEntries.push({
        sourcePath: document.path,
        sourceName: document.name,
        line: lineNumber,
        matchedText,
        excerpt,
      })
    }
  }

  return mentionEntries.sort((left, right) => {
    if (left.sourcePath !== right.sourcePath) return left.sourcePath.localeCompare(right.sourcePath)
    return left.line - right.line
  })
}

export function getWorkspaceBrokenDocumentLinks(snapshot: WorkspaceIndexSnapshot): WorkspaceResolvedDocumentLink[] {
  return snapshot.documents.flatMap((document) =>
    getWorkspaceOutgoingDocumentLinks(snapshot, document.path).filter((link) => link.broken)
  )
}

export function getWorkspaceDocumentLinkRepairCandidates(
  snapshot: WorkspaceIndexSnapshot,
  documentPath: string,
  link: Pick<WorkspaceResolvedDocumentLink, 'target' | 'kind' | 'sourcePath' | 'anchor' | 'broken'>
): WorkspaceDocumentLinkRepairCandidate[] {
  if (!link.broken) return []

  const sourceDocument = getWorkspaceDocument(snapshot, documentPath)
  if (!sourceDocument) return []

  const { pathTarget } = splitLinkTarget(link.target)
  const normalizedTarget = normalizeWorkspacePath(pathTarget)
  const targetBaseName = getPathBaseName(normalizedTarget)
  const targetStem = stripFileExtension(targetBaseName)
  const normalizedTargetBase = normalizeLookupValue(targetBaseName)
  const normalizedTargetStem = normalizeLookupValue(targetStem)
  const requiredHeadingAnchor = normalizeAnchorValue(link.anchor ?? '')

  return snapshot.documents
    .filter((document) => document.path !== sourceDocument.path)
    .map((document) => {
      const heading = requiredHeadingAnchor ? resolveHeadingReference(document, link.anchor) : null
      if (requiredHeadingAnchor && !heading) return null

      const candidateBaseName = getPathBaseName(document.path)
      const candidateStem = stripFileExtension(candidateBaseName)
      const normalizedCandidateBase = normalizeLookupValue(candidateBaseName)
      const normalizedCandidateStem = normalizeLookupValue(candidateStem)
      const replacementTarget =
        link.kind === 'wikilink'
          ? buildWorkspaceWikiLinkTarget(snapshot.rootPath, document.path, heading?.text ?? null)
          : buildRelativeWorkspaceDocumentLinkTarget(sourceDocument.path, document.path, heading?.id ?? null)
      const score = scoreWorkspaceDocumentLinkRepairCandidate({
        normalizedTarget,
        normalizedTargetBase,
        normalizedTargetStem,
        normalizedCandidateBase,
        normalizedCandidateStem,
        candidatePath: document.path,
        replacementTarget,
        hasHeadingMatch: heading !== null,
      })
      if (score < 80) return null

      return {
        path: document.path,
        name: document.name,
        replacementTarget,
        score,
        headingText: heading?.text ?? null,
      } satisfies WorkspaceDocumentLinkRepairCandidate
    })
    .filter((candidate): candidate is WorkspaceDocumentLinkRepairCandidate => candidate !== null)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score
      return left.path.localeCompare(right.path)
    })
}

export function getWorkspaceAssetReferences(
  snapshot: WorkspaceIndexSnapshot,
  documentPath?: string
): WorkspaceResolvedAssetReference[] {
  const documents = documentPath ? [getWorkspaceDocument(snapshot, documentPath)].filter(isPresent) : snapshot.documents
  const filePathSet = new Set(snapshot.files.map((file) => normalizeWorkspacePath(file.path)))
  const references: WorkspaceResolvedAssetReference[] = []

  for (const document of documents) {
    for (const asset of document.assets) {
      const resolvedPath =
        asset.local
          ? resolveRelativeWorkspaceTarget(document.path, asset.source)
          : null

      references.push({
        documentPath: document.path,
        documentName: document.name,
        source: asset.source,
        kind: asset.kind,
        line: asset.line,
        local: asset.local,
        resolvedPath,
        missing: asset.local ? !resolvedPath || !filePathSet.has(resolvedPath) : false,
        sourceStart: asset.sourceStart,
        sourceEnd: asset.sourceEnd,
      })
    }
  }

  return references
}

export function getWorkspaceMissingAssetReferences(snapshot: WorkspaceIndexSnapshot): WorkspaceResolvedAssetReference[] {
  return getWorkspaceAssetReferences(snapshot).filter((reference) => reference.missing)
}

export function getWorkspaceOrphanedAssets(snapshot: WorkspaceIndexSnapshot): WorkspaceOrphanedAsset[] {
  const referencedPaths = new Set(
    getWorkspaceAssetReferences(snapshot)
      .map((reference) => reference.resolvedPath)
      .filter(isPresent)
      .map((path) => normalizeWorkspacePath(path))
  )

  return snapshot.files
    .filter((file) => !MARKDOWN_FILE_EXTENSIONS.includes(getFileExtension(file.path) as (typeof MARKDOWN_FILE_EXTENSIONS)[number]))
    .filter((file) => isLikelyWorkspaceAssetFileName(file.name))
    .filter((file) => !referencedPaths.has(normalizeWorkspacePath(file.path)))
    .map((file) => ({
      path: file.path,
      name: file.name,
      kind: resolveWorkspaceFileAssetKind(file.name),
    }))
    .filter((file): file is WorkspaceOrphanedAsset => file.kind !== null)
    .sort((left, right) => left.path.localeCompare(right.path))
}

export function getWorkspaceAssetRepairCandidates(
  snapshot: WorkspaceIndexSnapshot,
  documentPath: string,
  asset: Pick<WorkspaceResolvedAssetReference, 'source' | 'local' | 'missing'>
): WorkspaceAssetRepairCandidate[] {
  if (!asset.local || !asset.missing) return []

  const { pathSource, suffix } = splitAssetReferenceSource(asset.source)
  const normalizedSource = normalizeWorkspacePath(pathSource)
  const sourceBaseName = getPathBaseName(normalizedSource)
  const sourceStem = stripFileExtension(sourceBaseName)
  const sourceExtension = getFileExtension(sourceBaseName)

  return snapshot.files
    .filter((file) => isLikelyWorkspaceAssetFileName(file.name))
    .map((file) => {
      const relativeSource = buildRelativeWorkspaceAssetPath(documentPath, file.path)
      return {
        path: file.path,
        name: file.name,
        relativeSource: `${relativeSource}${suffix}`,
        score: scoreWorkspaceAssetRepairCandidate({
          sourceBaseName,
          sourceStem,
          sourceExtension,
          candidatePath: file.path,
          candidateName: file.name,
          relativeSource,
        }),
      }
    })
    .filter((candidate) => candidate.score >= 80 && normalizeWorkspacePath(splitAssetReferenceSource(candidate.relativeSource).pathSource) !== normalizedSource)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score
      return left.path.localeCompare(right.path)
    })
}

export function getWorkspaceHealthFindings(snapshot: WorkspaceIndexSnapshot): WorkspaceHealthFinding[] {
  const findings: WorkspaceHealthFinding[] = []

  for (const document of snapshot.documents) {
    for (const diagnostic of document.diagnostics) {
      findings.push({
        documentPath: document.path,
        documentName: document.name,
        kind: diagnostic.kind,
        message: diagnostic.message,
        line: diagnostic.line,
        heading: diagnostic.heading,
        subject: diagnostic.subject,
        relatedLine: diagnostic.relatedLine,
        detail: diagnostic.detail,
      })
    }
  }

  for (const link of getWorkspaceBrokenDocumentLinks(snapshot)) {
    findings.push({
      documentPath: link.sourcePath,
      documentName: link.sourceName,
      kind: 'broken-link',
      message: `Broken document link "${link.target}".`,
      line: link.line,
    })
  }

  for (const asset of getWorkspaceMissingAssetReferences(snapshot)) {
    findings.push({
      documentPath: asset.documentPath,
      documentName: asset.documentName,
      kind: 'missing-asset',
      message: `Missing asset "${asset.source}".`,
      line: asset.line,
    })
  }

  return findings.sort((left, right) => {
    if (left.documentPath !== right.documentPath) return left.documentPath.localeCompare(right.documentPath)
    if (left.line !== right.line) return left.line - right.line
    return left.message.localeCompare(right.message)
  })
}

function getWorkspaceDocument(
  snapshot: WorkspaceIndexSnapshot,
  documentPath: string
): WorkspaceIndexDocument | null {
  const normalizedTargetPath = normalizeWorkspacePath(documentPath)
  return snapshot.documents.find((document) => normalizeWorkspacePath(document.path) === normalizedTargetPath) ?? null
}

function resolveDocumentLink(
  link: WorkspaceIndexLink,
  sourceDocument: WorkspaceIndexDocument,
  context: WorkspaceResolutionContext
): {
  anchor: string | null
  resolvedPath: string | null
  resolvedName: string | null
  resolvedHeadingLine: number | null
  resolvedHeadingText: string | null
  ambiguous: boolean
} {
  if (link.kind === 'wikilink') {
    return resolveWikiLinkTarget(link.target, context)
  }

  const { pathTarget, anchor } = splitLinkTarget(link.target)
  const resolvedPath = resolveRelativeWorkspaceTarget(sourceDocument.path, pathTarget)
  if (!resolvedPath) {
    return {
      anchor,
      resolvedPath: null,
      resolvedName: null,
      resolvedHeadingLine: null,
      resolvedHeadingText: null,
      ambiguous: false,
    }
  }

  const directDocument = context.documentsByPath.get(resolvedPath)
  if (directDocument) {
    const heading = resolveHeadingReference(directDocument, anchor)
    return {
      anchor,
      resolvedPath,
      resolvedName: directDocument.name,
      resolvedHeadingLine: heading?.line ?? null,
      resolvedHeadingText: heading?.text ?? null,
      ambiguous: false,
    }
  }

  if (!hasExtension(pathTarget)) {
    const candidates = MARKDOWN_FILE_EXTENSIONS
      .map((extension) => context.documentsByPath.get(`${resolvedPath}.${extension}`))
      .filter(isPresent)

    if (candidates.length === 1) {
      const heading = resolveHeadingReference(candidates[0], anchor)
      return {
        anchor,
        resolvedPath: candidates[0].path,
        resolvedName: candidates[0].name,
        resolvedHeadingLine: heading?.line ?? null,
        resolvedHeadingText: heading?.text ?? null,
        ambiguous: false,
      }
    }

    if (candidates.length > 1) {
      return {
        anchor,
        resolvedPath: null,
        resolvedName: null,
        resolvedHeadingLine: null,
        resolvedHeadingText: null,
        ambiguous: true,
      }
    }
  }

  return {
    anchor,
    resolvedPath: null,
    resolvedName: null,
    resolvedHeadingLine: null,
    resolvedHeadingText: null,
    ambiguous: false,
  }
}

function resolveWikiLinkTarget(
  rawTarget: string,
  context: WorkspaceResolutionContext
): {
  anchor: string | null
  resolvedPath: string | null
  resolvedName: string | null
  resolvedHeadingLine: number | null
  resolvedHeadingText: string | null
  ambiguous: boolean
} {
  const { pathTarget, anchor } = splitLinkTarget(rawTarget)
  const target = normalizeLookupValue(pathTarget)
  if (!target) {
    return {
      anchor,
      resolvedPath: null,
      resolvedName: null,
      resolvedHeadingLine: null,
      resolvedHeadingText: null,
      ambiguous: false,
    }
  }

  const exactPathMatches = context.documents.filter((document) => normalizeLookupValue(document.path) === target)
  if (exactPathMatches.length === 1) {
    const heading = resolveHeadingReference(exactPathMatches[0], anchor)
    return {
      anchor,
      resolvedPath: exactPathMatches[0].path,
      resolvedName: exactPathMatches[0].name,
      resolvedHeadingLine: heading?.line ?? null,
      resolvedHeadingText: heading?.text ?? null,
      ambiguous: false,
    }
  }
  if (exactPathMatches.length > 1) {
    return { anchor, resolvedPath: null, resolvedName: null, resolvedHeadingLine: null, resolvedHeadingText: null, ambiguous: true }
  }

  const nameMatches = context.documentsByNormalizedName.get(target) ?? []
  if (nameMatches.length === 1) {
    const heading = resolveHeadingReference(nameMatches[0], anchor)
    return {
      anchor,
      resolvedPath: nameMatches[0].path,
      resolvedName: nameMatches[0].name,
      resolvedHeadingLine: heading?.line ?? null,
      resolvedHeadingText: heading?.text ?? null,
      ambiguous: false,
    }
  }
  if (nameMatches.length > 1) {
    return { anchor, resolvedPath: null, resolvedName: null, resolvedHeadingLine: null, resolvedHeadingText: null, ambiguous: true }
  }

  const stemMatches = context.documentsByNormalizedStem.get(target) ?? []
  if (stemMatches.length === 1) {
    const heading = resolveHeadingReference(stemMatches[0], anchor)
    return {
      anchor,
      resolvedPath: stemMatches[0].path,
      resolvedName: stemMatches[0].name,
      resolvedHeadingLine: heading?.line ?? null,
      resolvedHeadingText: heading?.text ?? null,
      ambiguous: false,
    }
  }
  if (stemMatches.length > 1) {
    return { anchor, resolvedPath: null, resolvedName: null, resolvedHeadingLine: null, resolvedHeadingText: null, ambiguous: true }
  }

  return {
    anchor,
    resolvedPath: null,
    resolvedName: null,
    resolvedHeadingLine: null,
    resolvedHeadingText: null,
    ambiguous: false,
  }
}

function buildWorkspaceResolutionContext(snapshot: WorkspaceIndexSnapshot): WorkspaceResolutionContext {
  const documentsByPath = new Map<string, WorkspaceIndexDocument>()
  const documentsByNormalizedName = new Map<string, WorkspaceIndexDocument[]>()
  const documentsByNormalizedStem = new Map<string, WorkspaceIndexDocument[]>()

  for (const document of snapshot.documents) {
    const normalizedPath = normalizeWorkspacePath(document.path)
    documentsByPath.set(normalizedPath, document)
    pushDocumentLookup(documentsByNormalizedName, normalizeLookupValue(document.name), document)
    pushDocumentLookup(documentsByNormalizedStem, normalizeLookupValue(stripMarkdownExtension(document.name)), document)
  }

  return {
    documents: snapshot.documents,
    documentsByPath,
    documentsByNormalizedName,
    documentsByNormalizedStem,
  }
}

function pushDocumentLookup(
  map: Map<string, WorkspaceIndexDocument[]>,
  key: string,
  document: WorkspaceIndexDocument
): void {
  if (!key) return
  const existing = map.get(key)
  if (existing) {
    existing.push(document)
    return
  }
  map.set(key, [document])
}

function resolveRelativeWorkspaceTarget(documentPath: string, rawTarget: string): string | null {
  const { pathTarget } = splitLinkTarget(rawTarget)
  const target = pathTarget
  if (!target || !isLocalTarget(target)) return null
  if (target.startsWith('/')) return normalizeWorkspacePath(target)

  const baseDirectory = getDirectoryPath(documentPath)
  return normalizeWorkspacePath(joinRelativePath(baseDirectory, target))
}

function isDocumentLikeLink(link: WorkspaceIndexLink): boolean {
  if (link.kind === 'wikilink') return true

  const { pathTarget } = splitLinkTarget(link.target)
  const target = pathTarget
  if (!target || !isLocalTarget(target)) return false

  const extension = getFileExtension(target)
  if (!extension) return true
  return MARKDOWN_FILE_EXTENSIONS.includes(extension as (typeof MARKDOWN_FILE_EXTENSIONS)[number])
}

function splitLinkTarget(value: string): {
  pathTarget: string
  anchor: string | null
} {
  const trimmed = value.trim()
  const hashIndex = trimmed.indexOf('#')
  const pathWithQuery = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex)
  const anchor = hashIndex === -1 ? null : trimmed.slice(hashIndex + 1).trim() || null

  return {
    pathTarget: pathWithQuery.split('?', 1)[0]?.trim() ?? '',
    anchor,
  }
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

function joinRelativePath(baseDirectory: string, relativePath: string): string {
  if (!baseDirectory) return relativePath
  return `${baseDirectory}/${relativePath}`
}

function buildRelativeWorkspaceDocumentLinkTarget(
  sourceDocumentPath: string,
  targetDocumentPath: string,
  headingId: string | null
): string {
  const relativePath = buildRelativeWorkspaceAssetPath(sourceDocumentPath, targetDocumentPath)
  return headingId ? `${relativePath}#${headingId}` : relativePath
}

function buildWorkspaceWikiLinkTarget(
  rootPath: string,
  targetDocumentPath: string,
  headingText: string | null
): string {
  const normalizedRootPath = normalizeWorkspacePath(rootPath)
  const normalizedTargetPath = normalizeWorkspacePath(targetDocumentPath)
  const rootPrefix = normalizedRootPath ? `${normalizedRootPath}/` : ''
  const rootRelativePath = normalizedTargetPath.startsWith(rootPrefix)
    ? normalizedTargetPath.slice(rootPrefix.length)
    : normalizedTargetPath
  const extensionlessPath = stripMarkdownExtension(rootRelativePath)

  return headingText ? `${extensionlessPath}#${headingText}` : extensionlessPath
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

function scoreWorkspaceDocumentLinkRepairCandidate(input: {
  normalizedTarget: string
  normalizedTargetBase: string
  normalizedTargetStem: string
  normalizedCandidateBase: string
  normalizedCandidateStem: string
  candidatePath: string
  replacementTarget: string
  hasHeadingMatch: boolean
}): number {
  let score = 0

  if (input.normalizedCandidateBase === input.normalizedTargetBase && input.normalizedTargetBase) {
    score += 320
  }
  if (input.normalizedCandidateStem === input.normalizedTargetStem && input.normalizedTargetStem) {
    score += 280
  }
  if (
    input.normalizedTarget &&
    normalizeLookupValue(input.candidatePath).endsWith(input.normalizedTarget.replace(/^\.\/+/u, ''))
  ) {
    score += 180
  }
  if (
    input.normalizedTargetStem &&
    (input.normalizedCandidateBase.includes(input.normalizedTargetStem) ||
      input.normalizedCandidateStem.includes(input.normalizedTargetStem))
  ) {
    score += 90
  }
  if (normalizeLookupValue(input.replacementTarget).includes(input.normalizedTargetStem)) {
    score += 40
  }
  if (input.hasHeadingMatch) {
    score += 60
  }

  return score
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

function isLocalTarget(target: string): boolean {
  return !/^(?:https?:|mailto:|tel:|data:|blob:)/iu.test(target) && !target.startsWith('//')
}

function hasExtension(path: string): boolean {
  return /\.[A-Za-z0-9]+$/u.test(path)
}

function getFileExtension(path: string): string | null {
  const match = path.match(/\.([A-Za-z0-9]+)$/u)
  return match?.[1]?.toLowerCase() ?? null
}

function resolveHeadingReference(
  document: WorkspaceIndexDocument,
  anchor: string | null
): WorkspaceIndexDocument['headings'][number] | null {
  if (!anchor) return null

  const normalizedAnchor = normalizeAnchorValue(anchor)
  if (!normalizedAnchor) return null

  const exactIdMatch = document.headings.find((heading) => heading.id === normalizedAnchor)
  if (exactIdMatch) return exactIdMatch

  const slugMatch = document.headings.find((heading) => slugifyHeading(heading.text) === normalizedAnchor)
  if (slugMatch) return slugMatch

  const textMatch = document.headings.find((heading) => normalizeLookupValue(heading.text) === normalizeLookupValue(anchor))
  return textMatch ?? null
}

function normalizeAnchorValue(anchor: string): string {
  try {
    return decodeURIComponent(anchor.trim()).replace(/^#/u, '').trim().toLowerCase()
  } catch {
    return anchor.trim().replace(/^#/u, '').trim().toLowerCase()
  }
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.(md|markdown|mdx|txt)$/iu, '')
}

function stripFileExtension(value: string): string {
  return value.replace(/\.[A-Za-z0-9]+$/u, '')
}

function normalizeLookupValue(value: string): string {
  return value
    .trim()
    .replace(/\\/gu, '/')
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .toLowerCase()
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function scoreWorkspaceAssetRepairCandidate(input: {
  sourceBaseName: string
  sourceStem: string
  sourceExtension: string | null
  candidatePath: string
  candidateName: string
  relativeSource: string
}): number {
  const candidateBaseName = getPathBaseName(normalizeWorkspacePath(input.candidatePath))
  const candidateStem = stripFileExtension(candidateBaseName)
  const candidateExtension = getFileExtension(candidateBaseName)
  let score = 0

  if (candidateBaseName.toLowerCase() === input.sourceBaseName.toLowerCase()) {
    score += 300
  }

  if (normalizeLookupValue(candidateStem) === normalizeLookupValue(input.sourceStem)) {
    score += 200
  } else if (normalizeLookupValue(candidateStem).includes(normalizeLookupValue(input.sourceStem))) {
    score += 80
  }

  if (input.sourceExtension && candidateExtension === input.sourceExtension) {
    score += 30
  }

  if (normalizeWorkspacePath(input.relativeSource).includes('/images/')) {
    score += 10
  }

  if (
    ['/attachments/', '/assets/', '/files/', '/media/'].some((segment) =>
      normalizeWorkspacePath(input.relativeSource).includes(segment)
    )
  ) {
    score += 10
  }

  return score
}

function resolveWorkspaceFileAssetKind(fileName: string): 'image' | 'attachment' | null {
  if (isLikelyImageFileName(fileName)) return 'image'
  if (isLikelyAttachmentFileName(fileName)) return 'attachment'
  return null
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

interface WorkspaceResolutionContext {
  documents: WorkspaceIndexDocument[]
  documentsByPath: Map<string, WorkspaceIndexDocument>
  documentsByNormalizedName: Map<string, WorkspaceIndexDocument[]>
  documentsByNormalizedStem: Map<string, WorkspaceIndexDocument[]>
}
