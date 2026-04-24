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
  assert.match(editor, /mergeSelectionBubbleRects/)
  assert.match(editor, /const container = containerRef\.current/)
  assert.match(editor, /const visualSelectionTo = selection\.to > selection\.from \? selection\.to - 1 : selection\.to/)
  assert.match(editor, /view\.coordsAtPos\(selection\.from,\s*1\)\s*\?\?\s*view\.coordsAtPos\(selection\.from\)/)
  assert.match(editor, /view\.coordsAtPos\(visualSelectionTo,\s*-1\)\s*\?\?\s*view\.coordsAtPos\(visualSelectionTo\)/)
  assert.match(editor, /const selectionRect = mergeSelectionBubbleRects\(selectionStartCoords,\s*selectionEndCoords\)/)
  assert.match(editor, /const shellRect = shell\.getBoundingClientRect\(\)/)
  assert.match(editor, /const editorRect = container\.getBoundingClientRect\(\)/)
  assert.match(editor, /const scaleX = Math\.max\(view\.scaleX \|\| 1,\s*0\.0001\)/)
  assert.match(editor, /const scaleY = Math\.max\(view\.scaleY \|\| 1,\s*0\.0001\)/)
  assert.match(editor, /const lineHeight = Number\.isFinite\(view\.defaultLineHeight\) \? view\.defaultLineHeight : 0/)
  assert.match(editor, /const positionInEditor = computeAISelectionBubblePosition\(selectionRect,\s*\{/)
  assert.match(editor, /gap: Math\.max\(lineHeight \/ 4,\s*2\)/)
  assert.match(editor, /if \(!Number\.isFinite\(nextTop\) \|\| !Number\.isFinite\(nextLeft\)\) \{\s*setSelectionBubble\(null\)/)
  assert.match(editor, /top: nextTop/)
  assert.match(editor, /left: nextLeft/)
  assert.match(editor, /document\.addEventListener\(EDITOR_AI_OPEN_EVENT, handleAIOpen\)/)
  assert.match(editor, /document\.addEventListener\(EDITOR_AI_APPLY_EVENT, handleAIApply\)/)
  assert.match(editor, /onSizeChange=\{handleSelectionBubbleSizeChange\}/)
  assert.match(editor, /new ResizeObserver\(\(\) => scheduleSelectionBubbleUpdate\(\)\)/)
})

test('CodeMirrorEditor coalesces high-frequency selection bubble updates through requestAnimationFrame', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /const scheduleSelectionBubbleUpdate = useCallback\(/)
  assert.match(editor, /selectionBubbleRafRef\.current = requestAnimationFrame\(/)
  assert.match(editor, /cancelAnimationFrame\(selectionBubbleRafRef\.current\)/)
  assert.match(editor, /const handleScroll = \(\) => scheduleSelectionBubbleUpdate\(view\)/)
  assert.match(editor, /const handleResize = \(\) => scheduleSelectionBubbleUpdate\(view\)/)
  assert.match(editor, /scheduleSelectionBubbleUpdate\(view\)\s*\n\s*scheduleTableExitFocusRestore\(view\)/)
})

test('MarkdownPreview useMemo deps omit the i18n t function to avoid redundant HTML rebuilds', async () => {
  const source = await readFile(
    new URL('../src/components/Preview/MarkdownPreview.tsx', import.meta.url),
    'utf8'
  )

  // previewHtml useMemo deps
  assert.match(
    source,
    /\[documentPath, html, i18n\.language, isTauri, previewOrigin, resolvedExternalImages, resolvedLocalImages\]/
  )
  // mermaidLabels useMemo deps — only language, no t
  assert.match(source, /\[i18n\.language\]\s*\)\s*\n\s*const getMermaidTheme/)
})

test('AI setup panel owns AI connection settings while ThemePanel stays editor-only', async () => {
  const [themePanel, aiPanel, section] = await Promise.all([
    readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AISetupPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ThemePanel/AISettingsSection.tsx', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(themePanel, /AISettingsSection/)
  assert.match(aiPanel, /data-ai-setup-panel="true"/)
  assert.match(aiPanel, /t\('ai\.setup\.title'\)/)
  assert.match(aiPanel, /<AISettingsSection \/>/)
  assert.match(section, /t\('ai\.connection\.baseUrl'\)/)
  assert.match(section, /t\('ai\.connection\.model'\)/)
  assert.match(section, /t\('ai\.connection\.apiKey'\)/)
  assert.match(section, /structuredStores: aiStructuredStores\.map\(\(store\) => \(\{[\s\S]*defaultMode: 'sql-draft',[\s\S]*executionAgentProfileId: null,[\s\S]*\}\)\)/)
  assert.doesNotMatch(section, /t\('ai\.connection\.description'\)/)
  assert.doesNotMatch(section, /t\('ai\.connection\.defaultMode'\)/)
  assert.doesNotMatch(section, /t\('ai\.connection\.executionAgentProfile'\)/)
  assert.doesNotMatch(section, /t\('ai\.preferences\.defaultWriteTarget'\)/)
  assert.doesNotMatch(section, /t\('ai\.preferences\.selectedTextRole'\)/)
  assert.doesNotMatch(section, /data-ai-history-provider-settings="true"/)
  assert.doesNotMatch(section, /t\('ai\.preferences\.historyProviderTitle'\)/)
  assert.doesNotMatch(section, /t\('ai\.preferences\.historyProviderEnabled'\)/)
  assert.doesNotMatch(section, /t\('ai\.preferences\.historyProviderBudget'\)/)
})

test('AI settings keep secret inputs in a submit form while matching the Settings panel section style', async () => {
  const section = await readFile(new URL('../src/components/ThemePanel/AISettingsSection.tsx', import.meta.url), 'utf8')

  assert.match(section, /function handleSubmit\(event: FormEvent<HTMLFormElement>\)/)
  assert.match(section, /event\.preventDefault\(\)\s*\n\s*void saveAiConnection\(\)/)
  assert.match(section, /<form data-ai-settings="true" className="space-y-5" onSubmit=\{handleSubmit\}>/)
  assert.doesNotMatch(section, /autoComplete="off"/)
  assert.match(section, /<legend className="sr-only">\{t\('ai\.connection\.title'\)\}<\/legend>/)
  assert.match(section, /<legend className="sr-only">\{title\}<\/legend>/)
  assert.match(section, /<p className="text-xs font-medium" style=\{\{ color: 'var\(--text-muted\)' \}\}>\s*\{t\('ai\.connection\.title'\)\}/)
  assert.match(section, /type="url"\s*\n\s*inputMode="url"\s*\n\s*autoComplete="url"\s*\n\s*value=\{aiBaseUrl\}/)
  assert.match(section, /type="url"\s*\n\s*inputMode="url"\s*\n\s*autoComplete="url"\s*\n\s*value=\{profile\.domainUrl\}/)
  assert.match(section, /<FormField label=\{t\('ai\.connection\.apiKey'\)\}>[\s\S]*<div className="flex gap-2">[\s\S]*type="password"[\s\S]*min-w-0 flex-1[\s\S]*onClick=\{\(\) => void clearDirectApiKey\(\)\}[\s\S]*\{t\('ai\.connection\.clearKey'\)\}/)
  assert.match(section, /<FormField label=\{t\('ai\.connection\.clientSecret'\)\}>[\s\S]*<div className="flex gap-2">[\s\S]*type="password"[\s\S]*min-w-0 flex-1[\s\S]*onClick=\{\(\) => void clearHostedAgentSecret\(profile\.id\)\}[\s\S]*\{t\('ai\.connection\.clearClientSecret'\)\}/)
  assert.match(section, /t\('ai\.connection\.clientId'\)[\s\S]*t\('ai\.connection\.clientSecret'\)[\s\S]*t\('ai\.connection\.scope'\)/)
  assert.match(section, /type="password"\s*\n\s*autoComplete="new-password"/)
  assert.match(section, /type="submit"\s*\n\s*className="rounded-lg px-3 py-2 text-xs font-medium transition-colors"/)
  assert.doesNotMatch(section, /<div className="flex flex-wrap gap-2">[\s\S]*clearDirectApiKey/)
})

test('AI settings surface resolved hosted-agent URLs and notify the composer when provider state changes', async () => {
  const [section, composer] = await Promise.all([
    readFile(new URL('../src/components/ThemePanel/AISettingsSection.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(section, /dispatchAIProviderStateChanged\(\)/)
  assert.match(section, /buildHostedAgentTokenUrlPreview\(profile\.domainUrl\)/)
  assert.match(section, /buildHostedAgentInvokeUrlPreview\(profile\)/)
  assert.match(section, /t\('ai\.connection\.resolvedTokenUrl'\)/)
  assert.match(section, /t\('ai\.connection\.resolvedInvokeUrl'\)/)
  assert.match(composer, /AI_PROVIDER_STATE_CHANGED_EVENT/)
  assert.match(composer, /document\.addEventListener\(AI_PROVIDER_STATE_CHANGED_EVENT, handleProviderStateChanged\)/)
  assert.match(composer, /document\.removeEventListener\(AI_PROVIDER_STATE_CHANGED_EVENT, handleProviderStateChanged\)/)
})
