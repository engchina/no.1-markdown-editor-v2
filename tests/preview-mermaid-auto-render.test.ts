import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('MarkdownPreview auto-renders visible Mermaid shells while preserving manual render-all fallback', async () => {
  const source = await readFile(new URL('../src/components/Preview/MarkdownPreview.tsx', import.meta.url), 'utf8')

  assert.match(source, /const previewAutoRenderMermaid = useEditorStore\(\(state\) => state\.previewAutoRenderMermaid\)/u)
  assert.match(source, /if \(!preview \|\| !previewAutoRenderMermaid\) return/u)
  assert.match(source, /const MERMAID_AUTO_RENDER_DELAY_MS = 650/u)
  assert.match(source, /const MERMAID_AUTO_RENDER_ROOT_MARGIN = '240px 0px'/u)
  assert.match(source, /window\.setTimeout\(startAutoRender, MERMAID_AUTO_RENDER_DELAY_MS\)/u)
  assert.match(source, /querySelectorAll<HTMLElement>\('\.mermaid-shell\[data-mermaid-rendered="false"\]'\)/u)
  assert.match(source, /new IntersectionObserver\(/u)
  assert.match(source, /root: preview, rootMargin: MERMAID_AUTO_RENDER_ROOT_MARGIN, threshold: 0/u)
  assert.match(source, /observer\?\.unobserve\(shell\)/u)
  assert.match(source, /renderVisibleShell\(shell\)/u)
  assert.match(source, /typeof IntersectionObserver === 'undefined'[\s\S]*pendingShells\.forEach\(renderVisibleShell\)/u)
  assert.match(source, /warmMermaidShell\(shell\)/u)
  assert.match(source, /renderMermaidShells\(preview, mermaidTheme, \{[\s\S]*targets: \[shell\],[\s\S]*isCancelled: \(\) => cancelled/u)
  assert.match(source, /const renderAllDiagrams = \(\) => \{/u)
  assert.match(source, /onClick=\{renderAllDiagrams\}/u)
})

test('Mermaid auto-render can be disabled from persisted preview settings', async () => {
  const [store, panel] = await Promise.all([
    readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(store, /previewAutoRenderMermaid: boolean/u)
  assert.match(store, /setPreviewAutoRenderMermaid: \(enabled: boolean\) => void/u)
  assert.match(store, /previewAutoRenderMermaid: true/u)
  assert.match(store, /setPreviewAutoRenderMermaid: \(previewAutoRenderMermaid\) => set\(\{ previewAutoRenderMermaid \}\)/u)
  assert.match(store, /previewAutoRenderMermaid: s\.previewAutoRenderMermaid/u)
  assert.match(store, /previewAutoRenderMermaid: persistedState\?\.previewAutoRenderMermaid !== false/u)

  assert.match(panel, /previewAutoRenderMermaid/u)
  assert.match(panel, /setPreviewAutoRenderMermaid/u)
  assert.match(panel, /t\('themePanel\.previewAutoRenderMermaid'\)/u)
  assert.match(panel, /t\('themePanel\.previewAutoRenderMermaidHint'\)/u)
  assert.match(panel, /aria-pressed=\{previewAutoRenderMermaid\}/u)
})

test('Mermaid shell rendering state is shared by automatic and manual rendering paths', async () => {
  const [mermaidSource, css] = await Promise.all([
    readFile(new URL('../src/lib/mermaid.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
  ])

  assert.match(mermaidSource, /function setMermaidShellRendering\(shell: HTMLElement, rendering: boolean\): void/u)
  assert.match(mermaidSource, /shell\.dataset\.mermaidRendering = 'true'/u)
  assert.match(mermaidSource, /shell\.setAttribute\('aria-busy', 'true'\)/u)
  assert.match(mermaidSource, /delete shell\.dataset\.mermaidRendering/u)
  assert.match(mermaidSource, /if \(shell\.dataset\.mermaidRendering === 'true'\) continue/u)
  assert.match(mermaidSource, /finally \{\s*setMermaidShellRendering\(shell, false\)\s*\}/u)
  assert.match(css, /\.markdown-preview \.mermaid-shell\[data-mermaid-rendering='true'\] \.mermaid-card/u)
  assert.match(css, /\.markdown-preview \.mermaid-shell\[data-mermaid-rendering='true'\] \.mermaid-card-code/u)
})

test('Mermaid pending copy now describes the auto-render fallback state across locales', async () => {
  const [en, ja, zh] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8').then(JSON.parse),
  ])

  assert.equal(en.preview.diagramsPending, '{{count}} diagram not rendered yet')
  assert.equal(en.preview.diagramsPending_other, '{{count}} diagrams not rendered yet')
  assert.equal(en.themePanel.previewAutoRenderMermaid, 'Auto-render Mermaid diagrams')
  assert.equal(typeof en.themePanel.previewAutoRenderMermaidHint, 'string')
  assert.equal(ja.themePanel.previewAutoRenderMermaid, 'Mermaid 図を自動描画')
  assert.equal(typeof ja.themePanel.previewAutoRenderMermaidHint, 'string')
  assert.equal(zh.themePanel.previewAutoRenderMermaid, '自动渲染 Mermaid 图表')
  assert.equal(typeof zh.themePanel.previewAutoRenderMermaidHint, 'string')
  assert.equal(ja.preview.diagramsPending, '未描画の図が {{count}} 件あります')
  assert.equal(zh.preview.diagramsPending, '有 {{count}} 个图表尚未渲染')
})
