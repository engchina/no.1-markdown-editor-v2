import type { OutlineHeading } from '../outline.ts'

export interface WorkspaceIndexLink {
  target: string
  kind: 'markdown' | 'wikilink'
  local: boolean
  line: number
  sourceStart: number
  sourceEnd: number
}

export interface WorkspaceIndexAsset {
  source: string
  kind: 'markdown-image' | 'html-image' | 'markdown-attachment'
  local: boolean
  line: number
  altText: string | null
  sourceStart: number
  sourceEnd: number
}

export interface WorkspaceIndexFrontMatterSummary {
  raw: string
  keys: string[]
}

export interface WorkspaceIndexDiagnostic {
  kind: 'duplicate-heading' | 'missing-image-alt' | 'unresolved-footnote' | 'frontmatter-warning' | 'publish-warning'
  message: string
  line: number
  heading?: string
  subject?: string
  relatedLine?: number
  detail?:
    | 'duplicate-heading'
    | 'footnote-missing-definition'
    | 'footnote-unused-definition'
    | 'footnote-duplicate-definition'
    | 'frontmatter-unclosed'
    | 'frontmatter-empty'
    | 'frontmatter-duplicate-key'
    | 'publish-missing-title'
    | 'publish-title-mismatch'
    | 'publish-remote-asset'
}

export interface WorkspaceIndexDocument {
  path: string
  name: string
  title: string
  headings: OutlineHeading[]
  links: WorkspaceIndexLink[]
  assets: WorkspaceIndexAsset[]
  frontMatter: WorkspaceIndexFrontMatterSummary | null
  diagnostics: WorkspaceIndexDiagnostic[]
}

export interface WorkspaceIndexFile {
  path: string
  name: string
}

export interface WorkspaceIndexSnapshot {
  rootPath: string
  generatedAt: number
  documents: WorkspaceIndexDocument[]
  files: WorkspaceIndexFile[]
}

export interface WorkspaceIndexRuntime {
  scanRoot: (rootPath: string) => Promise<WorkspaceIndexSnapshot>
  readDocument: (path: string) => Promise<string>
  documentExists: (path: string) => Promise<boolean>
}

export interface WorkspaceIndexStore {
  getSnapshot: (rootPath: string) => Promise<WorkspaceIndexSnapshot>
  peekSnapshot: (rootPath: string) => WorkspaceIndexSnapshot | null
  getDocumentContent: (rootPath: string, documentPath: string) => Promise<string | null>
  invalidateRoot: (rootPath: string) => void
  invalidatePaths: (rootPath: string, paths: readonly string[]) => void
  clear: (rootPath?: string) => void
}
