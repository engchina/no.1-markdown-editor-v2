import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('AI Composer binds document font size to content text while keeping the widened dialog shell bounded', async () => {
  const [composer, coreView] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposerCoreView.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /const fontSize = useEditorStore\(\(state\) => state\.fontSize\)/)
  assert.match(composer, /function buildAIComposerContentTypography\(fontSize: number\)/)
  assert.match(composer, /<AIComposerCoreView[\s\S]*composerContentTypography=\{composerContentTypography\}/)
  assert.match(coreView, /data-ai-composer-prompt="true"[\s\S]*style=\{\{\s*\.\.\.composerContentTypography\.text,/)
  assert.match(coreView, /<AIDiffPreview[\s\S]*typography=\{composerContentTypography\}/)
  assert.match(coreView, /<AIInsertionPreview[\s\S]*typography=\{composerContentTypography\}/)
  assert.match(coreView, /maxWidth: 'min\(960px, calc\(100vw - 1rem\)\)'/)
  assert.doesNotMatch(coreView, /data-ai-composer="true"[\s\S]{0,260}fontSize:/)
})

test('sidebar stays width-driven while app-level zoom remains separate from document font size', async () => {
  const [sidebar, app, layout] = await Promise.all([
    readFile(new URL('../src/components/Sidebar/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/layout.ts', import.meta.url), 'utf8'),
  ])

  assert.match(sidebar, /export default function Sidebar\(\{ width \}: Props\)/)
  assert.match(sidebar, /className="sidebar-surface flex h-full min-h-0 flex-shrink-0 flex-col"[\s\S]*style=\{\{\s*width\s*,?\s*\}\}/)
  assert.doesNotMatch(sidebar, /useEditorStore\(\(state\) => state\.fontSize\)/)
  assert.match(app, /const \{\s*[\s\S]*zoom,[\s\S]*\} = useEditorStore\(\)/)
  assert.match(app, /zoom: `\$\{zoom\}%`/)
  assert.match(app, /store\.setZoom\(Math\.min\(300, store\.zoom \+ 10\)\)/)
  assert.match(app, /store\.setZoom\(Math\.max\(50, store\.zoom - 10\)\)/)
  assert.match(app, /store\.setZoom\(100\)/)
  assert.doesNotMatch(app, /store\.setFontSize\(/)
  assert.match(layout, /export const SIDEBAR_MIN_WIDTH = 260/)
  assert.match(layout, /export const SIDEBAR_MAX_WIDTH = 420/)
})
