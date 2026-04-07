import type { SupportedMermaidParserType } from './mermaidParser.ts'

export type MermaidTheme = 'default' | 'dark'

type MermaidModule = typeof import('mermaid')
type MermaidWarmLoader = () => Promise<unknown>

let mermaidPromise: Promise<MermaidModule> | null = null
let mermaidRenderSequence = 0
const MAX_MERMAID_RENDER_CACHE_ENTRIES = 48
const mermaidRenderCache = new Map<string, string>()
const mermaidWarmCache = new Map<string, Promise<void>>()
const canUseBrowserChunkLoaders = typeof window !== 'undefined'

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
const pieDiagramLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/mermaid/dist/chunks/mermaid.core/pieDiagram-*.mjs')
    : {}
const wardleyDiagramLoader =
  canUseBrowserChunkLoaders
    ? import.meta.glob('../../node_modules/mermaid/dist/chunks/mermaid.core/wardleyDiagram-*.mjs')
    : {}

const mermaidDiagramWarmers: Partial<Record<SupportedMermaidParserType, MermaidWarmLoader>> = {
  architecture: () => pickSingleMermaidWarmLoader(architectureDiagramLoader, 'architecture')(),
  gitGraph: () => pickSingleMermaidWarmLoader(gitGraphDiagramLoader, 'gitGraph')(),
  info: () => pickSingleMermaidWarmLoader(infoDiagramLoader, 'info')(),
  pie: () => pickSingleMermaidWarmLoader(pieDiagramLoader, 'pie')(),
  wardley: () => pickSingleMermaidWarmLoader(wardleyDiagramLoader, 'wardley')(),
}

const mermaidDiagramTypeMatchers: ReadonlyArray<readonly [SupportedMermaidParserType, RegExp]> = [
  ['architecture', /^architecture(?:-beta)?\b/i],
  ['wardley', /^wardley-beta\b/i],
  ['gitGraph', /^gitGraph\b/i],
  ['info', /^info\b/i],
  ['packet', /^packet(?:-beta)?\b/i],
  ['pie', /^pie\b/i],
  ['radar', /^radar-beta\b/i],
  ['treeView', /^treeView-beta\b/i],
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
}

function loadMermaid() {
  mermaidPromise ??= import('mermaid')
  return mermaidPromise
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
  await warmMermaidResource('core', loadMermaid)
}

function getMermaidDefinitionLine(source: string): string | null {
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('%%')) continue
    return trimmed
  }

  return null
}

export function detectMermaidDiagramType(source: string): SupportedMermaidParserType | null {
  const definitionLine = getMermaidDefinitionLine(source)
  if (!definitionLine) return null

  for (const [diagramType, matcher] of mermaidDiagramTypeMatchers) {
    if (matcher.test(definitionLine)) {
      return diagramType
    }
  }

  return null
}

export async function warmMermaidForSource(source: string): Promise<void> {
  const diagramType = detectMermaidDiagramType(source)
  const warmTasks: Promise<void>[] = [warmMermaid()]

  if (diagramType) {
    const diagramWarmer = mermaidDiagramWarmers[diagramType]
    if (diagramWarmer) {
      warmTasks.push(warmMermaidResource(`diagram:${diagramType}`, diagramWarmer))
    } else {
      warmTasks.push(
        warmMermaidResource(`parser:${diagramType}`, async () => {
          const { warmMermaidParser } = await import('./mermaidParser.ts')
          await warmMermaidParser(diagramType)
        })
      )
    }
  }

  await Promise.all(warmTasks)
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

  let mermaid: MermaidModule['default'] | null = null

  for (const [index, shell] of shells.entries()) {
    if (options.isCancelled?.()) return false

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
      })
      continue
    }

    try {
      clearMermaidShellStatus(shell)
      mermaid ??= (await loadMermaid()).default
      mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' })

      const { svg } = await mermaid.render(
        `mermaid-${Date.now()}-${mermaidRenderSequence++}-${index}`,
        source
      )
      if (options.isCancelled?.()) return false

      cacheMermaidSvg(source, theme, svg)
      surface.innerHTML = ''
      applyRenderedMermaidShell(shell, svg, {
        label: shell.querySelector<HTMLElement>('.mermaid-card-label')?.textContent ?? '',
        render: button?.textContent ?? '',
        refresh: shell.dataset.mermaidRefreshLabel ?? 'Refresh diagram',
        error: shell.dataset.mermaidErrorLabel ?? 'Diagram could not be rendered',
      })
    } catch (error) {
      console.error('Mermaid error:', error)
      setMermaidShellStatus(
        shell,
        getMermaidErrorMessage(error, shell.dataset.mermaidErrorLabel ?? 'Diagram could not be rendered')
      )
      if (button) button.textContent = getMermaidActionLabel(shell)
      if (code) code.hidden = false
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
  let mermaid: MermaidModule['default'] | null = null

  const blocks = Array.from(template.content.querySelectorAll('code.language-mermaid'))
  for (const [index, block] of blocks.entries()) {
    const source = block.textContent ?? ''
    const pre = block.parentElement
    if (!pre) continue

    try {
      const cachedSvg = getCachedMermaidSvg(source, theme)
      const svg = cachedSvg
        ? cachedSvg
        : (
            mermaid ??= (await loadMermaid()).default,
            mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' }),
            (await mermaid.render(
              `mermaid-export-${Date.now()}-${mermaidRenderSequence++}-${index}`,
              source
            )).svg
          )

      if (!cachedSvg) cacheMermaidSvg(source, theme, svg)
      const container = document.createElement('div')
      container.className = 'mermaid'
      container.innerHTML = svg
      pre.replaceWith(container)
    } catch (error) {
      console.error('Mermaid export error:', error)
    }
  }

  return template.innerHTML
}
