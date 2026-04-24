import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('App exposes a dedicated overlay boundary that stops floating panels before the status bar', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(app, /data-overlay-boundary="true"/)
})

test('toolbar menus render through a portal so scroll shells cannot clip them', async () => {
  const toolbar = await readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8')

  assert.match(toolbar, /import \{ createPortal \} from 'react-dom'/)
  assert.match(toolbar, /useAnchoredOverlayStyle/)
  assert.match(toolbar, /return createPortal\(/)
  assert.match(toolbar, /useAnchoredOverlayStyle\(triggerRef, \{ align, width, zoom \}\)/)
})

test('theme panel is anchored in a portal instead of the toolbar DOM subtree', async () => {
  const panel = await readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8')

  assert.match(panel, /import \{ createPortal \} from 'react-dom'/)
  assert.match(panel, /useAnchoredOverlayStyle/)
  assert.match(panel, /return createPortal\(/)
  assert.match(panel, /const \{[\s\S]*zoom,[\s\S]*\} = useEditorStore\(\)/)
  assert.match(panel, /useAnchoredOverlayStyle\(triggerRef, \{ align: 'right', width: 420, zoom \}\)/)
})

test('AI setup panel is anchored in a portal instead of the toolbar DOM subtree', async () => {
  const panel = await readFile(new URL('../src/components/AI/AISetupPanel.tsx', import.meta.url), 'utf8')

  assert.match(panel, /import \{ createPortal \} from 'react-dom'/)
  assert.match(panel, /useAnchoredOverlayStyle/)
  assert.match(panel, /return createPortal\(/)
  assert.match(panel, /useEditorStore\(\(state\) => state\.zoom\)/)
  assert.match(panel, /useAnchoredOverlayStyle\(triggerRef, \{ align: 'right', width: 420, zoom \}\)/)
})

test('about panel is anchored in a portal instead of the toolbar DOM subtree', async () => {
  const panel = await readFile(new URL('../src/components/Updates/AboutPanel.tsx', import.meta.url), 'utf8')

  assert.match(panel, /import \{ createPortal \} from 'react-dom'/)
  assert.match(panel, /useAnchoredOverlayStyle/)
  assert.match(panel, /return createPortal\(/)
  assert.match(panel, /useEditorStore\(\(state\) => state\.zoom\)/)
  assert.match(panel, /useAnchoredOverlayStyle\(triggerRef, \{ align: 'right', width: 344, zoom \}\)/)
})
