import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('Ctrl/Cmd+W closes only the active file through the shared dirty-tab close flow', async () => {
  const [app, fileOps, tabs, commands] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useFileOps.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DocumentTabs/DocumentTabs.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8'),
  ])

  assert.match(app, /const \{ saveAllDirtyTabs, closeActiveFile \} = useFileOps\(\)/)
  assert.match(app, /matchesPrimaryShortcut\(event, \{ key: 'w' \}\)/)
  assert.match(app, /event\.preventDefault\(\)\s*\n\s*if \(!event\.repeat\) void closeActiveFile\(\)/)

  assert.match(fileOps, /const closeTabById = useCallback\(/)
  assert.match(fileOps, /const closeActiveFile = useCallback\(async \(\): Promise<boolean> => \{/)
  assert.match(fileOps, /return closeTabById\(activeTab\.id\)/)
  assert.match(fileOps, /const messageText = i18n\.t\('dialog\.unsavedMessage', \{ name: tab\.name \}\)/)
  assert.match(fileOps, /const saved = await saveTabById\(tab\.id\)[\s\S]*closeTab\(tab\.id\)/)
  assert.match(fileOps, /closeTabById,\s*\n\s*closeActiveFile,/)

  assert.match(tabs, /const \{ closeTabById \} = useFileOps\(\)/)
  assert.match(tabs, /void closeTabById\(tab\.id\)/)
  assert.doesNotMatch(tabs, /window\.confirm\(/)
  assert.doesNotMatch(tabs, /@tauri-apps\/plugin-dialog/)

  assert.match(commands, /const \{ newFile, openFile, saveFile, saveFileAs, closeActiveFile \} = useFileOps\(\)/)
  assert.match(commands, /const closeFileShortcut = formatPrimaryShortcut\('W'\)/)
  assert.match(commands, /id: 'file\.close'[\s\S]*label: t\('menu\.closeFile'\)[\s\S]*shortcut: closeFileShortcut[\s\S]*void closeActiveFile\(\)/)
})
