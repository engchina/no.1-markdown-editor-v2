import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('CodeMirrorEditor scrolls inserted markdown into view when it updates the selection', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /appendEditorSelectionScrollEffect\(view, options\.effects, selectionAnchor\)/)
  assert.match(editor, /keepEditorCursorBottomGap\(view, \{ force: true \}\)/)
})

test('insertMarkdown re-dispatches scroll effect after double rAF so off-screen content gets correct coordinates', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  // The double-rAF block must re-dispatch a fresh scrollIntoView effect so that
  // CodeMirror applies it after rendering the new content (fixes async image paste scroll).
  assert.match(editor, /requestAnimationFrame[\s\S]*?requestAnimationFrame[\s\S]*?appendEditorSelectionScrollEffect\(view, undefined, selectionAnchor\)/)
})

test('accepted AI ghost text scrolls the new cursor position into view', async () => {
  const ghost = await readFile(new URL('../src/lib/ai/ghostText.ts', import.meta.url), 'utf8')

  assert.match(ghost, /appendEditorSelectionScrollEffect\(view, \[/)
})

test('editor scroll helper keeps three line-heights below the cursor', async () => {
  const helper = await readFile(new URL('../src/lib/editorScroll.ts', import.meta.url), 'utf8')

  assert.match(helper, /EDITOR_CURSOR_SCROLL_LINES = 3/)
  assert.match(helper, /view\.defaultLineHeight \* EDITOR_CURSOR_SCROLL_LINES/)
})

test('outline source navigation repeats the CodeMirror scroll effect after layout settles', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')
  const helper = await readFile(new URL('../src/lib/editorScroll.ts', import.meta.url), 'utf8')
  const navigationHelper = helper.slice(
    helper.indexOf('export function scheduleEditorNavigationScroll'),
    helper.indexOf('export function resolveEditorCursorBottomGapScrollTop')
  )

  assert.match(editor, /createEditorNavigationScrollEffect\(anchor, \{ align \}\)/)
  assert.match(editor, /scheduleEditorNavigationScroll\(view, anchor, \{ align \}\)/)
  assert.match(navigationHelper, /requestAnimationFrame\(\(\) => \{[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?view\.dispatch/u)
  assert.match(navigationHelper, /effects: createEditorNavigationScrollEffect\(safeAnchor, \{ align, margin \}\)/)
  assert.doesNotMatch(navigationHelper, /scrollDOM\.scrollTop = nextScrollTop/u)
})

test('Delete key edits capture and restore the source viewport instead of snapping back to the top', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')
  const helper = await readFile(new URL('../src/lib/editorScroll.ts', import.meta.url), 'utf8')

  assert.match(editor, /event\.key !== 'Delete'/)
  assert.match(editor, /captureEditorScrollSnapshot\(view\)/)
  assert.match(editor, /restoreEditorScrollSnapshot\(view, snapshot\)/)
  assert.match(helper, /scrollDOM\.scrollTop = snapshot\.scrollTop/)
  assert.match(helper, /scrollDOM\.scrollLeft = snapshot\.scrollLeft/)
})

test('generic source typing no longer injects bottom-gap scrolling into every selection update', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /onSelectionChange: \(view, update\) => \{[\s\S]*restorePendingDeleteKeyScroll\(view, update\)/)
  assert.doesNotMatch(editor, /onSelectionChange: \(view, update\) => \{[\s\S]*keepEditorCursorBottomGap\(view\)/)
})

test('editor and preview share a bottom buffer so end-of-document content can lift off the viewport edge', async () => {
  const css = await readFile(new URL('../src/global.css', import.meta.url), 'utf8')

  assert.match(css, /--document-bottom-buffer:\s*5\.4em;/)
  assert.match(css, /\.cm-content\s*\{[\s\S]*?padding:\s*24px 0 var\(--document-bottom-buffer\) !important;/)
  assert.match(css, /\.focus-mode-container \.cm-content\s*\{[\s\S]*?padding:\s*24px 0 var\(--document-bottom-buffer\) !important;/)
  assert.match(css, /\.markdown-preview\s*\{[\s\S]*?padding:\s*32px 48px var\(--document-bottom-buffer\);/)
})
