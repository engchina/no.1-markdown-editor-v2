export type SupportedMermaidParserType =
  | 'architecture'
  | 'gitGraph'
  | 'info'
  | 'packet'
  | 'pie'
  | 'radar'
  | 'treeView'
  | 'wardley'

type ParserServiceModule = Record<string, (...args: never[]) => Record<string, { parser: { LangiumParser: MermaidLangiumParser } }>>

type MermaidLangiumParser = {
  parse: (text: string) => {
    lexerErrors: Array<{ line?: number; column?: number; message: string }>
    parserErrors: Array<{ token: { startLine?: number; startColumn?: number }; message: string }>
    value: unknown
  }
}

type ParserRecord = Record<SupportedMermaidParserType, MermaidLangiumParser>
type LoaderRecord = Record<SupportedMermaidParserType, () => Promise<ParserServiceModule>>
const canUseBrowserChunkLoaders = typeof window !== 'undefined'

const architectureLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/architecture-*.mjs')
    : {}
const gitGraphLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/gitGraph-*.mjs')
    : {}
const infoLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/info-*.mjs')
    : {}
const packetLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/packet-*.mjs')
    : {}
const pieLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/pie-*.mjs')
    : {}
const radarLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/radar-*.mjs')
    : {}
const treeViewLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/treeView-*.mjs')
    : {}
const wardleyLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/wardley-*.mjs')
    : {}

const parsers: Partial<ParserRecord> = {}

const loaderMap: LoaderRecord = {
  architecture: () => pickSingleLoader(architectureLoader, 'architecture')(),
  gitGraph: () => pickSingleLoader(gitGraphLoader, 'gitGraph')(),
  info: () => pickSingleLoader(infoLoader, 'info')(),
  packet: () => pickSingleLoader(packetLoader, 'packet')(),
  pie: () => pickSingleLoader(pieLoader, 'pie')(),
  radar: () => pickSingleLoader(radarLoader, 'radar')(),
  treeView: () => pickSingleLoader(treeViewLoader, 'treeView')(),
  wardley: () => pickSingleLoader(wardleyLoader, 'wardley')(),
}

const parserFactoryMap: Record<SupportedMermaidParserType, { create: string; service: string }> = {
  architecture: { create: 'createArchitectureServices', service: 'Architecture' },
  gitGraph: { create: 'createGitGraphServices', service: 'GitGraph' },
  info: { create: 'createInfoServices', service: 'Info' },
  packet: { create: 'createPacketServices', service: 'Packet' },
  pie: { create: 'createPieServices', service: 'Pie' },
  radar: { create: 'createRadarServices', service: 'Radar' },
  treeView: { create: 'createTreeViewServices', service: 'TreeView' },
  wardley: { create: 'createWardleyServices', service: 'Wardley' },
}

function pickSingleLoader(
  registry: Record<string, () => Promise<unknown>>,
  type: SupportedMermaidParserType
): () => Promise<ParserServiceModule> {
  const entries = Object.values(registry)
  if (entries.length !== 1) {
    if (entries.length === 0 && !canUseBrowserChunkLoaders) {
      throw new Error(`Mermaid parser loader "${type}" is unavailable outside the Vite runtime`)
    }

    throw new Error(`Expected exactly one Mermaid parser chunk for "${type}", found ${entries.length}`)
  }

  return entries[0] as () => Promise<ParserServiceModule>
}

function formatMermaidParseErrorMessage(result: {
  lexerErrors: Array<{ line?: number; column?: number; message: string }>
  parserErrors: Array<{ token: { startLine?: number; startColumn?: number }; message: string }>
}): string {
  const lexerErrors = result.lexerErrors.map((error) => {
    const line = error.line !== undefined && !Number.isNaN(error.line) ? error.line : '?'
    const column = error.column !== undefined && !Number.isNaN(error.column) ? error.column : '?'
    return `Lexer error on line ${line}, column ${column}: ${error.message}`
  }).join('\n')

  const parserErrors = result.parserErrors.map((error) => {
    const line =
      error.token.startLine !== undefined && !Number.isNaN(error.token.startLine)
        ? error.token.startLine
        : '?'
    const column =
      error.token.startColumn !== undefined && !Number.isNaN(error.token.startColumn)
        ? error.token.startColumn
        : '?'
    return `Parse error on line ${line}, column ${column}: ${error.message}`
  }).join('\n')

  return `Parsing failed: ${lexerErrors} ${parserErrors}`.trim()
}

async function ensureParser(type: SupportedMermaidParserType): Promise<MermaidLangiumParser> {
  const existing = parsers[type]
  if (existing) return existing

  const module = await loaderMap[type]()
  const mapping = parserFactoryMap[type]
  const createServices = module[mapping.create]
  if (typeof createServices !== 'function') {
    throw new Error(`Mermaid parser factory "${mapping.create}" for "${type}" is unavailable`)
  }

  const services = createServices()
  const parser = services[mapping.service]?.parser?.LangiumParser
  if (!parser || typeof parser.parse !== 'function') {
    throw new Error(`Mermaid parser service "${mapping.service}" for "${type}" is unavailable`)
  }

  parsers[type] = parser
  return parser
}

export async function warmMermaidParser(type: SupportedMermaidParserType): Promise<void> {
  await ensureParser(type)
}

export async function parse(diagramType: string, text: string): Promise<unknown> {
  if (!(diagramType in loaderMap)) {
    throw new Error(`Unknown diagram type: ${diagramType}`)
  }

  const type = diagramType as SupportedMermaidParserType
  const parser = await ensureParser(type)
  const result = parser.parse(text)
  if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
    throw new Error(formatMermaidParseErrorMessage(result))
  }

  return result.value
}
