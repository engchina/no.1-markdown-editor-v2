import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('App wires Ctrl/Cmd+J to open the AI composer and mounts the composer shell', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(app, /const AIComposer = lazy\(\(\) => import\('\.\/components\/AI\/AIComposer'\)\)/)
  assert.match(app, /matchesPrimaryShortcut\(event, \{ key: 'j' \}\)/)
  assert.match(app, /dispatchEditorAIOpen\(\{ source: 'shortcut' \}\)/)
  assert.match(app, /\{aiComposerOpen && \(/)
})

test('CodeMirrorEditor renders the selection bubble and listens for AI open/apply events', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /import AISelectionBubble from '\.\.\/AI\/AISelectionBubble'/)
  assert.match(editor, /document\.addEventListener\(EDITOR_AI_OPEN_EVENT, handleAIOpen\)/)
  assert.match(editor, /document\.addEventListener\(EDITOR_AI_APPLY_EVENT, handleAIApply\)/)
  assert.match(editor, /onSizeChange=\{handleSelectionBubbleSizeChange\}/)
  assert.match(editor, /new ResizeObserver\(\(\) => updateSelectionBubble\(\)\)/)
})

test('ThemePanel keeps AI connection settings but removes editable AI preference controls', async () => {
  const panel = await readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8')

  assert.match(panel, /t\('ai\.connection\.baseUrl'\)/)
  assert.match(panel, /t\('ai\.connection\.model'\)/)
  assert.match(panel, /t\('ai\.connection\.apiKey'\)/)
  assert.doesNotMatch(panel, /t\('ai\.preferences\.defaultWriteTarget'\)/)
  assert.doesNotMatch(panel, /t\('ai\.preferences\.selectedTextRole'\)/)
  assert.doesNotMatch(panel, /data-ai-history-provider-settings="true"/)
  assert.doesNotMatch(panel, /t\('ai\.preferences\.historyProviderTitle'\)/)
  assert.doesNotMatch(panel, /t\('ai\.preferences\.historyProviderEnabled'\)/)
  assert.doesNotMatch(panel, /t\('ai\.preferences\.historyProviderBudget'\)/)
})
