import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('editor store and sidebar include the AI tab as a first-class sidebar surface', async () => {
  const [store, sidebar, app] = await Promise.all([
    readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(store, /export type SidebarTab = 'ai' \| 'files' \| 'outline' \| 'search' \| 'recent'/)
  assert.match(sidebar, /\{ id: 'ai', icon: 'sparkles', title: t\('sidebar\.ai'\) \}/)
  assert.match(sidebar, /data-sidebar-tab=\{id\}/)
  assert.match(sidebar, /<AISidebarPanel activePeekView=\{aiPeekView\} onPeekChange=\{onAiPeekViewChange\} \/>/)
  assert.match(app, /<AISidebarPeekRail view=\{aiPeekView\} onClose=\{\(\) => setAiPeekView\(null\)\} \/>/)
})

test('AI sidebar focuses on composer and quick actions; peek rail provides library and commands views', async () => {
  const [panel, rail, shared] = await Promise.all([
    readFile(new URL('../src/components/Sidebar/AISidebarPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar/AISidebarPeekRail.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar/aiSidebarShared.ts', import.meta.url), 'utf8'),
  ])

  assert.match(shared, /const SIDEBAR_TAB_SOURCE = 'sidebar-tab' as AIComposerSource/)
  assert.match(shared, /createAITemplateOpenDetail\('ask', t, SIDEBAR_TAB_SOURCE\)/)
  assert.match(shared, /createAITemplateOpenDetail\('continueWriting', t, SIDEBAR_TAB_SOURCE\)/)
  assert.match(panel, /data-ai-sidebar-open-composer="true"/)
  assert.match(panel, /data-ai-sidebar-action=\{action\.id\}/)
  assert.match(panel, /data-ai-sidebar-peek-trigger=\{view\}/)
  assert.match(panel, /t\('ai\.sidebar\.activeStatus'\)/)
  assert.doesNotMatch(panel, /activeTab\?\.name \?\? t\('app\.untitled'\)/)
  assert.match(rail, /data-ai-sidebar-peek=\{view\}/)
  assert.match(rail, /data-ai-sidebar-template=\{template\.id\}/)
  assert.doesNotMatch(rail, /activeTab\?\.name \?\? t\('app\.untitled'\)/)
  assert.match(rail, /formatPrimaryShortcut\('J'\)/)
})
