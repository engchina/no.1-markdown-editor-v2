import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('layout uses the shared divider for both sidebar and split panes', async () => {
  const [app, divider] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Layout/ResizableDivider.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(app, /<ResizableDivider\s+variant="sidebar"/)
  assert.match(app, /<ResizableDivider\s+variant="pane"/)
  assert.match(app, /onReset=\{resetSidebarResize\}/)
  assert.match(app, /onReset=\{resetSplitResize\}/)
  assert.match(app, /useEditorStore\.getState\(\)\.sidebarWidth/)
  assert.match(app, /useEditorStore\.getState\(\)\.editorRatio/)
  assert.match(divider, /role="separator"/)
  assert.match(divider, /tabIndex=\{0\}/)
  assert.match(divider, /onDoubleClick=\{handleDoubleClick\}/)
  assert.match(divider, /onKeyDown=\{handleKeyDown\}/)
  assert.match(divider, /panel-divider__grip/)
  assert.match(divider, /panel-divider__hint/)
})

test('divider hint uses one custom tooltip without the native title tooltip', async () => {
  const [divider, css] = await Promise.all([
    readFile(new URL('../src/components/Layout/ResizableDivider.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(divider, /\stitle=/)
  assert.match(divider, /createPortal/)
  assert.match(divider, /data-hint-ready=\{hintPoint \? 'true' : 'false'\}/)
  assert.match(divider, /data-visible=\{showHint \? 'true' : 'false'\}/)
  assert.match(divider, /onPointerMove=\{handlePointerHintMove\}/)
  assert.match(css, /\.panel-divider__hint\s*\{[\s\S]*position: fixed/)
  assert.match(css, /\.panel-divider__hint\s*\{[\s\S]*white-space: normal/)
  assert.match(css, /\.panel-divider__hint\s*\{[\s\S]*overflow-wrap: anywhere/)
})

test('sidebar and editor share the same relative content shell', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(app, /<div className="flex flex-1 min-h-0 px-3 pb-3">\s*<div className="relative flex flex-1 min-h-0 min-w-0">/)
  assert.match(app, /className="relative z-10 flex min-h-0 flex-shrink-0 items-stretch"/)
  assert.match(app, /className="relative flex flex-1 min-w-0 flex-col overflow-hidden rounded-\[28px\] shadow-elegant"/)
  assert.doesNotMatch(app, /sidebar-peek-backdrop/)
})

test('divider copy is localized for all supported editor languages', async () => {
  const [en, ja, zh] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  for (const locale of [en, ja, zh]) {
    assert.match(locale, /"layout": \{/)
    assert.match(locale, /"sidebarResizeHandle":/)
    assert.match(locale, /"splitResizeHandle":/)
    assert.match(locale, /"resizeHint":/)
    assert.match(locale, /"sidebarResizeValue":/)
    assert.match(locale, /"splitResizeValue":/)
  }
})

test('sidebar resets to a comfortable default width within the allowed range', async () => {
  const layout = await readFile(new URL('../src/lib/layout.ts', import.meta.url), 'utf8')

  assert.match(layout, /export const SIDEBAR_MIN_WIDTH = 260/)
  assert.match(layout, /export const SIDEBAR_MAX_WIDTH = 420/)
  assert.match(layout, /export const SIDEBAR_DEFAULT_WIDTH = 320/)
  assert.doesNotMatch(layout, /export const SIDEBAR_DEFAULT_WIDTH = SIDEBAR_MAX_WIDTH/)
})
