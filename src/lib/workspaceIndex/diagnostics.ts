import type { OutlineHeading } from '../outline.ts'
import type {
  WorkspaceIndexAsset,
  WorkspaceIndexDiagnostic,
  WorkspaceIndexFrontMatterSummary,
} from './types.ts'

const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u
const UNCLOSED_FRONT_MATTER_PATTERN = /^---\r?\n[\s\S]*$/u
const FOOTNOTE_REFERENCE_PATTERN = /\[\^([^\]\r\n]+)\]/gu
const FOOTNOTE_DEFINITION_PATTERN = /^[ \t]{0,3}\[\^([^\]\r\n]+)\]:/u

export function buildWorkspaceDiagnostics(
  content: string,
  headings: OutlineHeading[],
  assets: WorkspaceIndexAsset[],
  frontMatter: WorkspaceIndexFrontMatterSummary | null
): WorkspaceIndexDiagnostic[] {
  const diagnostics: WorkspaceIndexDiagnostic[] = []

  diagnostics.push(...buildWorkspaceHeadingDiagnostics(headings))
  diagnostics.push(...buildWorkspaceAssetDiagnostics(assets))
  diagnostics.push(...buildWorkspaceFootnoteDiagnostics(content))
  diagnostics.push(...buildWorkspaceFrontMatterDiagnostics(content, frontMatter))
  diagnostics.push(...buildWorkspacePublishDiagnostics(content, headings, assets, frontMatter))

  return diagnostics
}

function buildWorkspaceHeadingDiagnostics(
  headings: OutlineHeading[]
): WorkspaceIndexDiagnostic[] {
  const seen = new Map<string, number>()
  const diagnostics: WorkspaceIndexDiagnostic[] = []

  for (const heading of headings) {
    const key = heading.text.trim().toLowerCase()
    if (!key) continue

    const previousLine = seen.get(key)
    if (previousLine !== undefined) {
      diagnostics.push({
        kind: 'duplicate-heading',
        message: `Duplicate heading "${heading.text}" also appears on line ${previousLine}.`,
        line: heading.line,
        heading: heading.text,
        relatedLine: previousLine,
        detail: 'duplicate-heading',
      })
      continue
    }

    seen.set(key, heading.line)
  }

  return diagnostics
}

function buildWorkspaceAssetDiagnostics(assets: WorkspaceIndexAsset[]): WorkspaceIndexDiagnostic[] {
  return assets.flatMap((asset) => {
    if (!isWorkspaceImageAssetKind(asset.kind)) return []
    if ((asset.altText ?? '').trim().length > 0) return []

    return [
      {
        kind: 'missing-image-alt' as const,
        message: `Image "${asset.source}" is missing alt text.`,
        line: asset.line,
        subject: asset.source,
      },
    ]
  })
}

function buildWorkspaceFootnoteDiagnostics(content: string): WorkspaceIndexDiagnostic[] {
  const references = new Map<string, number[]>()
  const definitions = new Map<string, number[]>()
  const lines = content.split(/\r?\n/u)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = index + 1
    const definitionMatch = line.match(FOOTNOTE_DEFINITION_PATTERN)

    if (definitionMatch?.[1]) {
      const label = definitionMatch[1].trim()
      if (label) {
        const existingLines = definitions.get(label) ?? []
        existingLines.push(lineNumber)
        definitions.set(label, existingLines)
      }
    }

    FOOTNOTE_REFERENCE_PATTERN.lastIndex = 0
    for (const match of line.matchAll(FOOTNOTE_REFERENCE_PATTERN)) {
      if (definitionMatch && match.index === definitionMatch.index) continue

      const label = match[1]?.trim() ?? ''
      if (!label) continue

      const existingLines = references.get(label) ?? []
      existingLines.push(lineNumber)
      references.set(label, existingLines)
    }
  }

  const diagnostics: WorkspaceIndexDiagnostic[] = []
  for (const [label, lines] of references) {
    if (definitions.has(label)) continue
    diagnostics.push({
      kind: 'unresolved-footnote',
      message: `Footnote reference [^${label}] has no definition.`,
      line: lines[0] ?? 1,
      subject: label,
      detail: 'footnote-missing-definition',
    })
  }

  for (const [label, lines] of definitions) {
    if (!references.has(label)) {
      diagnostics.push({
        kind: 'unresolved-footnote',
        message: `Footnote definition [^${label}] is never referenced.`,
        line: lines[0] ?? 1,
        subject: label,
        detail: 'footnote-unused-definition',
      })
    }

    if (lines.length > 1) {
      for (const duplicateLine of lines.slice(1)) {
        diagnostics.push({
          kind: 'unresolved-footnote',
          message: `Footnote definition [^${label}] appears more than once.`,
          line: duplicateLine,
          subject: label,
          relatedLine: lines[0] ?? 1,
          detail: 'footnote-duplicate-definition',
        })
      }
    }
  }

  return diagnostics
}

function buildWorkspaceFrontMatterDiagnostics(
  content: string,
  frontMatter: WorkspaceIndexFrontMatterSummary | null
): WorkspaceIndexDiagnostic[] {
  const diagnostics: WorkspaceIndexDiagnostic[] = []

  if (content.startsWith('---') && !FRONT_MATTER_PATTERN.test(content) && UNCLOSED_FRONT_MATTER_PATTERN.test(content)) {
    diagnostics.push({
      kind: 'frontmatter-warning',
      message: 'Front matter block is not closed.',
      line: 1,
      detail: 'frontmatter-unclosed',
    })
    return diagnostics
  }

  if (!frontMatter) return diagnostics

  if (frontMatter.raw.trim().length === 0) {
    diagnostics.push({
      kind: 'frontmatter-warning',
      message: 'Front matter block is empty.',
      line: 1,
      detail: 'frontmatter-empty',
    })
  }

  const match = content.match(FRONT_MATTER_PATTERN)
  if (!match?.[1]) return diagnostics

  const seenKeys = new Map<string, number>()
  const frontMatterLines = match[1].split(/\r?\n/u)
  for (let index = 0; index < frontMatterLines.length; index += 1) {
    const line = frontMatterLines[index]
    const keyMatch = /^\s*([A-Za-z0-9_-]+)\s*:/u.exec(line)
    const key = keyMatch?.[1]
    if (!key) continue

    const normalizedKey = key.toLowerCase()
    const lineNumber = index + 2
    const firstLine = seenKeys.get(normalizedKey)
    if (firstLine !== undefined) {
      diagnostics.push({
        kind: 'frontmatter-warning',
        message: `Front matter key "${key}" is duplicated; it first appears on line ${firstLine}.`,
        line: lineNumber,
        subject: key,
        relatedLine: firstLine,
        detail: 'frontmatter-duplicate-key',
      })
      continue
    }

    seenKeys.set(normalizedKey, lineNumber)
  }

  return diagnostics
}

function buildWorkspacePublishDiagnostics(
  content: string,
  headings: OutlineHeading[],
  assets: WorkspaceIndexAsset[],
  frontMatter: WorkspaceIndexFrontMatterSummary | null
): WorkspaceIndexDiagnostic[] {
  const diagnostics: WorkspaceIndexDiagnostic[] = []
  if (content.startsWith('---') && !frontMatter && UNCLOSED_FRONT_MATTER_PATTERN.test(content)) {
    return diagnostics
  }

  const firstH1 = headings.find((heading) => heading.level === 1) ?? null
  const frontMatterTitle = frontMatter ? extractFrontMatterScalarValue(frontMatter.raw, 'title') : null

  if (!firstH1 && !frontMatterTitle) {
    diagnostics.push({
      kind: 'publish-warning',
      message: 'Document has neither an H1 heading nor a front matter title. Exports may fall back to the filename.',
      line: 1,
      detail: 'publish-missing-title',
    })
  }

  if (
    frontMatterTitle &&
    firstH1 &&
    normalizeFrontMatterScalar(frontMatterTitle.value).toLowerCase() !== normalizeFrontMatterScalar(firstH1.text).toLowerCase()
  ) {
    diagnostics.push({
      kind: 'publish-warning',
      message: `Front matter title "${frontMatterTitle.value}" does not match the first H1 "${firstH1.text}". Exported or published titles may diverge.`,
      line: frontMatterTitle.line,
      subject: frontMatterTitle.value,
      detail: 'publish-title-mismatch',
    })
  }

  for (const asset of assets) {
    if (!isRemotePublishAssetSource(asset.source)) continue

    diagnostics.push({
      kind: 'publish-warning',
      message: isWorkspaceImageAssetKind(asset.kind)
        ? `Remote image "${asset.source}" depends on the network and may not survive offline export.`
        : `Remote asset "${asset.source}" depends on the network and may not survive offline export.`,
      line: asset.line,
      subject: asset.source,
      detail: 'publish-remote-asset',
    })
  }

  return diagnostics
}

function extractFrontMatterScalarValue(
  raw: string,
  key: string
): { value: string; line: number } | null {
  const normalizedKey = key.trim().toLowerCase()
  if (!normalizedKey) return null

  const lines = raw.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/u.exec(line)
    if (!match) continue

    const candidateKey = match[1]?.trim().toLowerCase()
    if (!candidateKey || candidateKey !== normalizedKey) continue

    const value = normalizeFrontMatterScalar(match[2] ?? '')
    if (!value) continue

    return {
      value,
      line: index + 2,
    }
  }

  return null
}

function normalizeFrontMatterScalar(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return trimmed.slice(1, -1).trim().replace(/\s+/gu, ' ')
    }
  }

  return trimmed.replace(/\s+/gu, ' ')
}

function isRemotePublishAssetSource(source: string): boolean {
  return /^(?:https?:)?\/\//iu.test(source.trim())
}

function isWorkspaceImageAssetKind(kind: WorkspaceIndexAsset['kind']): boolean {
  return kind === 'markdown-image' || kind === 'html-image'
}
