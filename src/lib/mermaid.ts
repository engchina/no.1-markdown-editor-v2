import type { ExternalDiagramDefinition } from 'mermaid'
import type { SupportedMermaidParserType } from './mermaidParser.ts'
import { attemptDynamicImportRecovery, wasDynamicImportRecoveryTriggered } from './vitePreloadRecovery.ts'

export type MermaidTheme = 'default' | 'dark'

type MermaidModule = typeof import('mermaid')
type MermaidLogosIconPackModule = typeof import('@iconify-json/logos')
type MermaidWarmLoader = () => Promise<unknown>
type MermaidExternalDiagramType = 'zenuml'
type MermaidDetectedDiagramType = SupportedMermaidParserType | MermaidExternalDiagramType
type MermaidLogosIconPackKey = 'common' | 'full'

let mermaidPromise: Promise<MermaidModule> | null = null
let mermaidParserPromise: Promise<typeof import('./mermaidParser.ts')> | null = null
let mermaidLogosIconPackPromise: Promise<MermaidLogosIconPackModule['icons']> | null = null
let mermaidLogosIconPackUrlPromise: Promise<string> | null = null
let mermaidCommonLogosIconPackPromise: Promise<MermaidLogosIconPackModule['icons']> | null = null
let mermaidCommonLogosIconPackUrlPromise: Promise<string> | null = null
let mermaidRenderSequence = 0
const MAX_MERMAID_RENDER_CACHE_ENTRIES = 48
const mermaidRenderCache = new Map<string, string>()
const mermaidWarmCache = new Map<string, Promise<void>>()
const canUseBrowserChunkLoaders = typeof window !== 'undefined'
let mermaidZenumlPluginPromise: Promise<ExternalDiagramDefinition> | null = null
let mermaidZenumlRegistrationPromise: Promise<void> | null = null
let mermaidZenumlRegistrationLevel: 'none' | 'lazy' | 'eager' = 'none'
let activeMermaidLogosIconPackKey: MermaidLogosIconPackKey | null = null

const COMMON_MERMAID_LOGOS_ICON_NAMES: ReadonlySet<string> = new Set([
  'apple',
  'aws',
  'azure-icon',
  'cloudflare',
  'confluence',
  'debian',
  'digital-ocean',
  'docker-icon',
  'elasticsearch',
  'figma',
  'firebase',
  'github-icon',
  'gitlab',
  'go',
  'google-cloud',
  'grafana',
  'graphql',
  'heroku',
  'java',
  'javascript',
  'jira',
  'kafka',
  'kubernetes',
  'linux-tux',
  'mariadb',
  'microsoft-azure',
  'mongodb',
  'mysql',
  'netlify',
  'nginx',
  'nodejs-icon',
  'notion-icon',
  'openai-icon',
  'oracle',
  'paypal',
  'postgresql',
  'prometheus',
  'python',
  'rabbitmq',
  'react',
  'redis',
  'sendgrid',
  'slack-icon',
  'sqlite',
  'stripe',
  'supabase',
  'terraform-icon',
  'twilio',
  'typescript',
  'ubuntu',
  'vercel',
  'vue',
] as const)

const architectureDiagramLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/mermaid/dist/chunks/mermaid.core/architectureDiagram-*.mjs')
    : {}
const gitGraphDiagramLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/mermaid/dist/chunks/mermaid.core/gitGraphDiagram-*.mjs')
    : {}
const infoDiagramLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/mermaid/dist/chunks/mermaid.core/infoDiagram-*.mjs')
    : {}
const genericDiagramLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/mermaid/dist/chunks/mermaid.core/diagram-*.mjs')
    : {}
const pieDiagramLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/mermaid/dist/chunks/mermaid.core/pieDiagram-*.mjs')
    : {}
const wardleyDiagramLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/mermaid/dist/chunks/mermaid.core/wardleyDiagram-*.mjs')
    : {}

const mermaidDiagramWarmers: Partial<Record<MermaidDetectedDiagramType, MermaidWarmLoader>> = {
  architecture: () => pickSingleMermaidWarmLoader(architectureDiagramLoader, 'architecture')(),
  gitGraph: () => pickSingleMermaidWarmLoader(gitGraphDiagramLoader, 'gitGraph')(),
  info: () => pickSingleMermaidWarmLoader(infoDiagramLoader, 'info')(),
  packet: () => warmMermaidLoaderGroup(genericDiagramLoader, 'generic-diagram-family'),
  pie: () => pickSingleMermaidWarmLoader(pieDiagramLoader, 'pie')(),
  radar: () => warmMermaidLoaderGroup(genericDiagramLoader, 'generic-diagram-family'),
  treemap: () => warmMermaidLoaderGroup(genericDiagramLoader, 'generic-diagram-family'),
  treeView: () => warmMermaidLoaderGroup(genericDiagramLoader, 'generic-diagram-family'),
  wardley: () => pickSingleMermaidWarmLoader(wardleyDiagramLoader, 'wardley')(),
  zenuml: async () => {
    const mermaid = await loadConfiguredMermaid()
    // ZenUML's runtime payload is unusually large, so warming should register
    // the external diagram lazily instead of preloading the full definition.
    await ensureMermaidExternalDiagramRegistered(mermaid, 'zenuml')
  },
}

const mermaidDiagramTypeMatchers: ReadonlyArray<readonly [MermaidDetectedDiagramType, RegExp]> = [
  ['architecture', /^architecture(?:-beta)?\b/i],
  ['wardley', /^wardley-beta\b/i],
  ['gitGraph', /^gitGraph\b/i],
  ['info', /^info\b/i],
  ['packet', /^packet(?:-beta)?\b/i],
  ['pie', /^pie\b/i],
  ['radar', /^radar-beta\b/i],
  ['treemap', /^treemap(?:-beta)?\b/i],
  ['treeView', /^treeView-beta\b/i],
  ['zenuml', /^zenuml\b/i],
]

interface RenderMermaidOptions {
  isCancelled?: () => boolean
  targets?: Element[]
  renderedOnly?: boolean
}

interface MermaidShellLabels {
  label: string
  render: string
  refresh: string
  error: string
  packetPlaceholderError: string
}

// Official Mermaid syntax pages sometimes show placeholder rows such as
// "... More Fields ...", which are not valid diagram statements.
const mermaidPlaceholderLinePattern = /^(?:\.{3}|…)(?:\s+.+\s+(?:\.{3}|…))?$/u

function loadMermaid() {
  mermaidPromise ??= import('mermaid').catch((error) => {
    mermaidPromise = null
    attemptDynamicImportRecovery(error)
    throw error
  })
  return mermaidPromise
}

function loadMermaidLogosIconPack() {
  mermaidLogosIconPackPromise ??= loadMermaidLogosIconPackUrl()
    .then(async (iconSetUrl) => {
      const response = await fetch(iconSetUrl)
      if (!response.ok) {
        throw new Error(`Failed to load Mermaid logos icon pack: ${response.status}`)
      }
      return (await response.json()) as MermaidLogosIconPackModule['icons']
    })
    .catch((error) => {
      mermaidLogosIconPackPromise = null
      throw error
    })

  return mermaidLogosIconPackPromise
}

function loadMermaidLogosIconPackUrl() {
  mermaidLogosIconPackUrlPromise ??= import('@iconify-json/logos/icons.json?url')
    .then((module) => module.default)
    .catch((error) => {
      mermaidLogosIconPackUrlPromise = null
      attemptDynamicImportRecovery(error)
      throw error
    })

  return mermaidLogosIconPackUrlPromise
}

function loadMermaidCommonLogosIconPackUrl() {
  mermaidCommonLogosIconPackUrlPromise ??= import('./mermaidLogosCommon.json?url')
    .then((module) => module.default)
    .catch((error) => {
      mermaidCommonLogosIconPackUrlPromise = null
      attemptDynamicImportRecovery(error)
      throw error
    })

  return mermaidCommonLogosIconPackUrlPromise
}

function loadMermaidCommonLogosIconPack() {
  mermaidCommonLogosIconPackPromise ??= loadMermaidCommonLogosIconPackUrl()
    .then(async (iconSetUrl) => {
      const response = await fetch(iconSetUrl)
      if (!response.ok) {
        throw new Error(`Failed to load Mermaid common logos icon pack: ${response.status}`)
      }
      return (await response.json()) as MermaidLogosIconPackModule['icons']
    })
    .catch((error) => {
      mermaidCommonLogosIconPackPromise = null
      throw error
    })

  return mermaidCommonLogosIconPackPromise
}

export function extractMermaidLogosIconNames(source: string): string[] {
  const matches = source.matchAll(/\blogos:([a-z0-9]+(?:[._-][a-z0-9]+)*)/giu)
  const uniqueNames = new Set<string>()

  for (const match of matches) {
    uniqueNames.add(match[1].toLowerCase())
  }

  return Array.from(uniqueNames)
}

export function canUseMermaidCommonLogosIconPack(source: string): boolean {
  const iconNames = extractMermaidLogosIconNames(source)
  return iconNames.length > 0 && iconNames.every((name) => COMMON_MERMAID_LOGOS_ICON_NAMES.has(name))
}

async function ensureMermaidLogosIconPackForSource(
  mermaid: MermaidModule['default'],
  source: string
): Promise<void> {
  const iconNames = extractMermaidLogosIconNames(source)
  if (iconNames.length === 0) return

  const nextPackKey: MermaidLogosIconPackKey =
    iconNames.every((name) => COMMON_MERMAID_LOGOS_ICON_NAMES.has(name)) ? 'common' : 'full'

  if (activeMermaidLogosIconPackKey === nextPackKey) return
  if (activeMermaidLogosIconPackKey === 'full' && nextPackKey === 'common') return

  const icons =
    nextPackKey === 'common'
      ? await loadMermaidCommonLogosIconPack()
      : await loadMermaidLogosIconPack()

  mermaid.registerIconPacks([
    {
      name: 'logos',
      icons,
    },
  ])
  activeMermaidLogosIconPackKey = nextPackKey
}

async function loadConfiguredMermaid(): Promise<MermaidModule['default']> {
  return (await loadMermaid()).default
}

function loadMermaidParser() {
  mermaidParserPromise ??= import('./mermaidParser.ts').catch((error) => {
    mermaidParserPromise = null
    attemptDynamicImportRecovery(error)
    throw error
  })
  return mermaidParserPromise
}

function isMermaidExternalDiagramType(
  diagramType: MermaidDetectedDiagramType | null
): diagramType is MermaidExternalDiagramType {
  return diagramType === 'zenuml'
}

async function loadMermaidZenumlPlugin(): Promise<ExternalDiagramDefinition> {
  mermaidZenumlPluginPromise ??= import('@mermaid-js/mermaid-zenuml')
    .then((module) => module.default)
    .catch((error) => {
      mermaidZenumlPluginPromise = null
      throw error
    })

  return mermaidZenumlPluginPromise
}

async function ensureMermaidExternalDiagramRegistered(
  mermaid: MermaidModule['default'],
  diagramType: MermaidExternalDiagramType,
  eagerLoad = false
): Promise<void> {
  if (diagramType !== 'zenuml') return
  if (eagerLoad ? mermaidZenumlRegistrationLevel === 'eager' : mermaidZenumlRegistrationLevel !== 'none') {
    return
  }

  if (mermaidZenumlRegistrationPromise) {
    await mermaidZenumlRegistrationPromise
    if (eagerLoad && mermaidZenumlRegistrationLevel !== 'eager') {
      await ensureMermaidExternalDiagramRegistered(mermaid, diagramType, true)
    }
    return
  }

  mermaidZenumlRegistrationPromise = (async () => {
    const zenuml = await loadMermaidZenumlPlugin()
    await mermaid.registerExternalDiagrams([zenuml], { lazyLoad: !eagerLoad })
    mermaidZenumlRegistrationLevel = eagerLoad ? 'eager' : 'lazy'
  })().finally(() => {
    mermaidZenumlRegistrationPromise = null
  })

  await mermaidZenumlRegistrationPromise
}

function pickSingleMermaidWarmLoader(
  registry: Record<string, () => Promise<unknown>>,
  type: SupportedMermaidParserType
): MermaidWarmLoader {
  const entries = Object.values(registry)
  if (entries.length !== 1) {
    if (entries.length === 0 && !canUseBrowserChunkLoaders) {
      throw new Error(`Mermaid warm loader "${type}" is unavailable outside the Vite runtime`)
    }

    throw new Error(`Expected exactly one Mermaid warm chunk for "${type}", found ${entries.length}`)
  }

  return entries[0]
}

function warmMermaidLoaderGroup(
  registry: Record<string, () => Promise<unknown>>,
  type: string
): Promise<void> {
  const entries = Object.values(registry)
  if (entries.length === 0) {
    if (!canUseBrowserChunkLoaders) {
      throw new Error(`Mermaid warm loader group "${type}" is unavailable outside the Vite runtime`)
    }

    throw new Error(`Expected at least one Mermaid warm chunk for "${type}", found 0`)
  }

  return Promise.all(entries.map((loader) => loader())).then(() => undefined)
}

function warmMermaidResource(resourceKey: string, loader: MermaidWarmLoader): Promise<void> {
  const existing = mermaidWarmCache.get(resourceKey)
  if (existing) return existing

  const warmPromise = loader()
    .then(() => undefined)
    .catch((error) => {
      mermaidWarmCache.delete(resourceKey)
      throw error
    })

  mermaidWarmCache.set(resourceKey, warmPromise)
  return warmPromise
}

export async function warmMermaid(): Promise<void> {
  await warmMermaidResource('core', loadConfiguredMermaid)
}

function getMermaidDefinitionLine(source: string): string | null {
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('%%')) continue
    return trimmed
  }

  return null
}

export function detectMermaidDiagramType(source: string): MermaidDetectedDiagramType | null {
  const definitionLine = getMermaidDefinitionLine(source)
  if (!definitionLine) return null

  for (const [diagramType, matcher] of mermaidDiagramTypeMatchers) {
    if (matcher.test(definitionLine)) {
      return diagramType
    }
  }

  return null
}

export function getRenderableMermaidSource(source: string): string {
  const lines = source.split(/\r?\n/u)
  let removedPlaceholderLine = false

  const renderableLines = lines.filter((line) => {
    const isPlaceholderLine = mermaidPlaceholderLinePattern.test(line.trim())
    removedPlaceholderLine ||= isPlaceholderLine
    return !isPlaceholderLine
  })

  return removedPlaceholderLine ? renderableLines.join('\n') : source
}

function getMermaidWarmResourceKey(diagramType: MermaidDetectedDiagramType): string {
  if (diagramType === 'packet' || diagramType === 'radar' || diagramType === 'treemap' || diagramType === 'treeView') {
    return 'diagram:generic-family'
  }

  return `diagram:${diagramType}`
}

export async function warmMermaidForSource(source: string): Promise<void> {
  const diagramType = detectMermaidDiagramType(source)
  const warmTasks: Promise<void>[] = [warmMermaid()]

  if (diagramType) {
    if (!isMermaidExternalDiagramType(diagramType)) {
      warmTasks.push(loadMermaidParser().then(({ warmMermaidParser }) => warmMermaidParser(diagramType)))
    }

    const diagramWarmer = mermaidDiagramWarmers[diagramType]
    if (diagramWarmer) {
      warmTasks.push(warmMermaidResource(getMermaidWarmResourceKey(diagramType), diagramWarmer))
    }
  }

  await Promise.all(warmTasks)
}

async function ensureMermaidDiagramSupport(
  mermaid: MermaidModule['default'],
  source: string
): Promise<MermaidDetectedDiagramType | null> {
  await ensureMermaidLogosIconPackForSource(mermaid, source)
  const diagramType = detectMermaidDiagramType(source)
  if (!isMermaidExternalDiagramType(diagramType)) {
    return diagramType
  }

  await ensureMermaidExternalDiagramRegistered(mermaid, diagramType)
  return diagramType
}

export async function warmMermaidForSources(sources: Iterable<string>): Promise<void> {
  const uniqueSources = new Set<string>()
  for (const source of sources) {
    uniqueSources.add(source)
  }

  if (uniqueSources.size === 0) {
    await warmMermaid()
    return
  }

  await Promise.all(Array.from(uniqueSources, (source) => warmMermaidForSource(source)))
}

function getMermaidCacheKey(source: string, theme: MermaidTheme): string {
  return `${theme}\u0000${source}`
}

function getCachedMermaidSvg(source: string, theme: MermaidTheme): string | null {
  const key = getMermaidCacheKey(source, theme)
  const svg = mermaidRenderCache.get(key) ?? null
  if (svg) {
    mermaidRenderCache.delete(key)
    mermaidRenderCache.set(key, svg)
  }
  return svg
}

function cacheMermaidSvg(source: string, theme: MermaidTheme, svg: string): void {
  const key = getMermaidCacheKey(source, theme)
  if (mermaidRenderCache.has(key)) {
    mermaidRenderCache.delete(key)
  }

  mermaidRenderCache.set(key, svg)
  while (mermaidRenderCache.size > MAX_MERMAID_RENDER_CACHE_ENTRIES) {
    const oldestKey = mermaidRenderCache.keys().next().value
    if (!oldestKey) break
    mermaidRenderCache.delete(oldestKey)
  }
}

function encodeMermaidSource(source: string): string {
  return encodeURIComponent(source)
}

function decodeMermaidSource(source: string): string {
  return decodeURIComponent(source)
}

function getMermaidActionLabel(shell: HTMLElement): string {
  return shell.dataset.mermaidRendered === 'true'
    ? shell.dataset.mermaidRefreshLabel ?? 'Refresh diagram'
    : shell.dataset.mermaidRenderLabel ?? 'Render diagram'
}

function clearMermaidShellStatus(shell: HTMLElement): void {
  const status = shell.querySelector<HTMLElement>('.mermaid-card-status')
  if (!status) return

  status.hidden = true
  status.textContent = ''
  status.removeAttribute('role')
  delete status.dataset.kind
}

function setMermaidShellStatus(shell: HTMLElement, message: string, kind: 'error' = 'error'): void {
  const status = shell.querySelector<HTMLElement>('.mermaid-card-status')
  if (!status) return

  status.textContent = message
  status.hidden = false
  status.dataset.kind = kind
  status.setAttribute('role', kind === 'error' ? 'alert' : 'status')
}

function setMermaidShellRendering(shell: HTMLElement, rendering: boolean): void {
  const button = shell.querySelector<HTMLButtonElement>('[data-mermaid-action="render"]')
  if (rendering) {
    shell.dataset.mermaidRendering = 'true'
    shell.setAttribute('aria-busy', 'true')
    if (button) button.disabled = true
    return
  }

  delete shell.dataset.mermaidRendering
  shell.removeAttribute('aria-busy')
  if (button) button.disabled = false
}

export function getMermaidErrorMessage(error: unknown, fallbackMessage: string): string {
  const detail =
    error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : ''

  if (!detail || detail === fallbackMessage) {
    return fallbackMessage
  }

  return `${fallbackMessage}: ${detail}`
}

function isPacketSyntaxTemplate(source: string): boolean {
  if (detectMermaidDiagramType(source) !== 'packet') return false

  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('%%') || /^packet(?:-beta)?\b/iu.test(trimmed)) continue
    if (/^start(?:-end)?:/iu.test(trimmed) || mermaidPlaceholderLinePattern.test(trimmed)) {
      return true
    }
  }

  return false
}

export function getMermaidRenderErrorMessage(
  error: unknown,
  fallbackMessage: string,
  source: string,
  packetPlaceholderMessage?: string
): string {
  if (packetPlaceholderMessage && isPacketSyntaxTemplate(source)) {
    return `${fallbackMessage}: ${packetPlaceholderMessage}`
  }

  return getMermaidErrorMessage(error, fallbackMessage)
}

export async function renderMermaidToSvg(
  source: string,
  theme: MermaidTheme,
  idPrefix = 'mermaid'
): Promise<string> {
  const cachedSvg = getCachedMermaidSvg(source, theme)
  if (cachedSvg) return cachedSvg

  const mermaid = await loadConfiguredMermaid()
  await ensureMermaidDiagramSupport(mermaid, source)
  mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' })

  const { svg } = await mermaid.render(
    `${idPrefix}-${Date.now()}-${mermaidRenderSequence++}`,
    getRenderableMermaidSource(source)
  )
  cacheMermaidSvg(source, theme, svg)
  return svg
}

function applyRenderedMermaidShell(shell: HTMLElement, svg: string, labels: MermaidShellLabels): void {
  const surface = shell.querySelector<HTMLElement>('.mermaid-render-surface')
  const code = shell.querySelector<HTMLElement>('.mermaid-card-code')
  const button = shell.querySelector<HTMLButtonElement>('[data-mermaid-action="render"]')
  if (!surface) return

  surface.innerHTML = svg
  surface.hidden = false
  shell.dataset.mermaidRendered = 'true'
  clearMermaidShellStatus(shell)
  if (code) code.hidden = true
  if (button) button.textContent = labels.refresh
}

function createMermaidShell(
  source: string,
  labels: MermaidShellLabels,
  renderedSvg?: string | null
): HTMLDivElement {
  const shell = document.createElement('div')
  shell.className = 'mermaid-shell'
  shell.dataset.mermaidSource = encodeMermaidSource(source)
  shell.dataset.mermaidRendered = renderedSvg ? 'true' : 'false'
  shell.dataset.mermaidRenderLabel = labels.render
  shell.dataset.mermaidRefreshLabel = labels.refresh
  shell.dataset.mermaidErrorLabel = labels.error
  shell.dataset.mermaidPacketPlaceholderError = labels.packetPlaceholderError
  shell.innerHTML = `
    <div class="mermaid-card">
      <div class="mermaid-card-header">
        <span class="mermaid-card-label"></span>
        <button type="button" class="mermaid-card-button" data-mermaid-action="render"></button>
      </div>
      <p class="mermaid-card-status" hidden></p>
      <pre class="mermaid-card-code"></pre>
      <div class="mermaid-render-surface" hidden></div>
    </div>
  `
  const label = shell.querySelector('.mermaid-card-label')
  if (label) label.textContent = labels.label
  const button = shell.querySelector<HTMLButtonElement>('[data-mermaid-action="render"]')
  if (button) button.textContent = labels.render
  const code = shell.querySelector('.mermaid-card-code')
  if (code) code.textContent = source
  if (renderedSvg) applyRenderedMermaidShell(shell, renderedSvg, labels)
  return shell
}

function getRenderableShells(
  root: ParentNode,
  targets?: Element[],
  renderedOnly = false
): HTMLElement[] {
  if (targets?.length) {
    return targets
      .map((target) => target.closest<HTMLElement>('.mermaid-shell'))
      .filter((shell): shell is HTMLElement => shell !== null)
  }

  const selector = renderedOnly ? '.mermaid-shell[data-mermaid-rendered="true"]' : '.mermaid-shell'
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
}

export function updateMermaidShellLabels(root: ParentNode, labels: MermaidShellLabels): void {
  const shells = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-shell'))
  for (const shell of shells) {
    shell.dataset.mermaidRenderLabel = labels.render
    shell.dataset.mermaidRefreshLabel = labels.refresh
    shell.dataset.mermaidErrorLabel = labels.error
    shell.dataset.mermaidPacketPlaceholderError = labels.packetPlaceholderError

    const label = shell.querySelector<HTMLElement>('.mermaid-card-label')
    if (label) label.textContent = labels.label

    const button = shell.querySelector<HTMLButtonElement>('[data-mermaid-action="render"]')
    if (!button) continue
    button.textContent = getMermaidActionLabel(shell)
  }
}

export function prepareMermaidShells(
  root: ParentNode,
  labels: MermaidShellLabels,
  theme: MermaidTheme
): number {
  const blocks = Array.from(root.querySelectorAll('code.language-mermaid'))
  for (const block of blocks) {
    const source = block.textContent ?? ''
    const pre = block.parentElement
    if (!pre) continue
    pre.replaceWith(createMermaidShell(source, labels, getCachedMermaidSvg(source, theme)))
  }

  return blocks.length
}

export async function renderMermaidShells(
  root: ParentNode,
  theme: MermaidTheme,
  options: RenderMermaidOptions = {}
): Promise<boolean> {
  const shells = getRenderableShells(root, options.targets, options.renderedOnly)
  if (shells.length === 0) return false

  for (const [index, shell] of shells.entries()) {
    if (options.isCancelled?.()) return false
    if (shell.dataset.mermaidRendering === 'true') continue

    const encodedSource = shell.dataset.mermaidSource
    if (!encodedSource) continue

    const surface = shell.querySelector<HTMLElement>('.mermaid-render-surface')
    const code = shell.querySelector<HTMLElement>('.mermaid-card-code')
    const button = shell.querySelector<HTMLButtonElement>('[data-mermaid-action="render"]')
    if (!surface) continue

    const source = decodeMermaidSource(encodedSource)
    const cachedSvg = getCachedMermaidSvg(source, theme)
    if (cachedSvg) {
      applyRenderedMermaidShell(shell, cachedSvg, {
        label: shell.querySelector<HTMLElement>('.mermaid-card-label')?.textContent ?? '',
        render: button?.textContent ?? '',
        refresh: shell.dataset.mermaidRefreshLabel ?? 'Refresh diagram',
        error: shell.dataset.mermaidErrorLabel ?? 'Diagram could not be rendered',
        packetPlaceholderError: shell.dataset.mermaidPacketPlaceholderError ?? '',
      })
      continue
    }

    try {
      setMermaidShellRendering(shell, true)
      clearMermaidShellStatus(shell)
      const svg = await renderMermaidToSvg(source, theme, `mermaid-${index}`)
      if (options.isCancelled?.()) return false

      surface.innerHTML = ''
      applyRenderedMermaidShell(shell, svg, {
        label: shell.querySelector<HTMLElement>('.mermaid-card-label')?.textContent ?? '',
        render: button?.textContent ?? '',
        refresh: shell.dataset.mermaidRefreshLabel ?? 'Refresh diagram',
        error: shell.dataset.mermaidErrorLabel ?? 'Diagram could not be rendered',
        packetPlaceholderError: shell.dataset.mermaidPacketPlaceholderError ?? '',
      })
    } catch (error) {
      if (wasDynamicImportRecoveryTriggered(error)) {
        return false
      }

      console.error('Mermaid error:', error)
      setMermaidShellStatus(
        shell,
        getMermaidRenderErrorMessage(
          error,
          shell.dataset.mermaidErrorLabel ?? 'Diagram could not be rendered',
          source,
          shell.dataset.mermaidPacketPlaceholderError
        )
      )
      if (button) button.textContent = getMermaidActionLabel(shell)
      if (code) code.hidden = false
    } finally {
      setMermaidShellRendering(shell, false)
    }
  }

  return true
}

export function hasRenderedMermaidShells(root: ParentNode): boolean {
  return root.querySelector('.mermaid-shell[data-mermaid-rendered="true"]') !== null
}

export function hasMermaidCode(root: ParentNode): boolean {
  return root.querySelector('code.language-mermaid, .mermaid-shell') !== null
}

export function countPendingMermaidShells(root: ParentNode): number {
  return root.querySelectorAll('.mermaid-shell[data-mermaid-rendered="false"]').length
}

export async function renderMermaidInHtml(html: string, theme: MermaidTheme): Promise<string> {
  if (!html.includes('language-mermaid')) return html

  const template = document.createElement('template')
  template.innerHTML = html

  const blocks = Array.from(template.content.querySelectorAll('code.language-mermaid'))
  for (const [index, block] of blocks.entries()) {
    const source = block.textContent ?? ''
    const pre = block.parentElement
    if (!pre) continue

    try {
      const svg = await renderMermaidToSvg(source, theme, `mermaid-export-${index}`)
      const container = document.createElement('div')
      container.className = 'mermaid'
      container.innerHTML = svg
      pre.replaceWith(container)
    } catch (error) {
      if (wasDynamicImportRecoveryTriggered(error)) {
        continue
      }

      console.error('Mermaid export error:', error)
    }
  }

  return template.innerHTML
}
