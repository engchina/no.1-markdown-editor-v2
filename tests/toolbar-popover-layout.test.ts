import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('toolbar menus render through a portal so scroll shells cannot clip them', async () => {
  const toolbar = await readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8')

  assert.match(toolbar, /import \{ createPortal \} from 'react-dom'/)
  assert.match(toolbar, /useAnchoredOverlayStyle/)
  assert.match(toolbar, /return createPortal\(/)
})

test('theme panel is anchored in a portal instead of the toolbar DOM subtree', async () => {
  const panel = await readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8')

  assert.match(panel, /import \{ createPortal \} from 'react-dom'/)
  assert.match(panel, /useAnchoredOverlayStyle/)
  assert.match(panel, /return createPortal\(/)
})

test('about panel is anchored in a portal instead of the toolbar DOM subtree', async () => {
  const panel = await readFile(new URL('../src/components/Updates/AboutPanel.tsx', import.meta.url), 'utf8')

  assert.match(panel, /import \{ createPortal \} from 'react-dom'/)
  assert.match(panel, /useAnchoredOverlayStyle/)
  assert.match(panel, /return createPortal\(/)
})
