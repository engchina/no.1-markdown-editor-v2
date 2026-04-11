import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('App mounts the update dialog and triggers the automatic update check on startup', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(app, /import UpdateAvailableDialog from '\.\/components\/Updates\/UpdateAvailableDialog'/)
  assert.match(app, /import \{ maybeRunAutomaticUpdateCheck \} from '\.\/lib\/updateActions'/)
  assert.match(app, /void maybeRunAutomaticUpdateCheck\(\)/)
  assert.match(app, /<UpdateAvailableDialog \/>/)
})

test('toolbar mounts a dedicated About panel and theme settings no longer include update controls', async () => {
  const toolbar = await readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8')
  const panel = await readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8')
  const aboutPanel = await readFile(new URL('../src/components/Updates/AboutPanel.tsx', import.meta.url), 'utf8')
  const updateSection = await readFile(new URL('../src/components/Updates/UpdateSettingsSection.tsx', import.meta.url), 'utf8')

  assert.match(toolbar, /import AboutPanel from '\.\.\/Updates\/AboutPanel'/)
  assert.match(toolbar, /data-toolbar-action="about"/)
  assert.match(toolbar, /<AboutPanel onClose=\{\(\) => setShowAbout\(false\)\} triggerRef=\{aboutButtonRef\} \/>/)
  assert.ok(!panel.includes('UpdateSettingsSection'))

  assert.match(aboutPanel, /data-about-panel="true"/)
  assert.match(aboutPanel, /<UpdateSettingsSection showSectionLabel=\{false\} \/>/)
  assert.match(updateSection, /data-update-settings="true"/)
  assert.match(updateSection, /showSectionLabel\?: boolean/)
  assert.match(updateSection, /t\('updates\.versionLabel'/)
  assert.match(updateSection, /t\('updates\.checkForUpdates'\)/)
  assert.match(updateSection, /t\('updates\.autoCheckOnLaunch'\)/)
  assert.match(updateSection, /t\('updates\.githubReleases'\)/)
})

test('toolbar right-side utility controls follow the approved order', async () => {
  const toolbar = await readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8')

  const focusIndex = toolbar.indexOf('data-toolbar-action="focus-mode"')
  const sourceIndex = toolbar.indexOf('data-view-mode={mode}')
  const commandPaletteIndex = toolbar.indexOf('data-toolbar-action="command-palette"')
  const languageIndex = toolbar.indexOf('data-language-select="true"')
  const settingsIndex = toolbar.indexOf('data-toolbar-action="settings"')
  const aboutIndex = toolbar.indexOf('data-toolbar-action="about"')

  assert.notEqual(focusIndex, -1)
  assert.notEqual(sourceIndex, -1)
  assert.notEqual(commandPaletteIndex, -1)
  assert.notEqual(languageIndex, -1)
  assert.notEqual(settingsIndex, -1)
  assert.notEqual(aboutIndex, -1)

  assert.ok(focusIndex < sourceIndex)
  assert.ok(sourceIndex < commandPaletteIndex)
  assert.ok(commandPaletteIndex < languageIndex)
  assert.ok(languageIndex < settingsIndex)
  assert.ok(settingsIndex < aboutIndex)
})

test('Command palette exposes the check-for-updates action', async () => {
  const commands = await readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8')
  const palette = await readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8')

  assert.match(commands, /id: 'file\.checkUpdates'/)
  assert.match(commands, /t\('commands\.checkForUpdates'\)/)
  assert.match(palette, /file\.checkUpdates/)
})

test('UpdateAvailableDialog renders a modal with download, skip, and cancel actions', async () => {
  const dialog = await readFile(new URL('../src/components/Updates/UpdateAvailableDialog.tsx', import.meta.url), 'utf8')

  assert.match(dialog, /role="dialog"/)
  assert.match(dialog, /aria-modal="true"/)
  assert.match(dialog, /t\('updates\.downloadLatest'\)/)
  assert.match(dialog, /t\('updates\.skipVersion'\)/)
  assert.match(dialog, /t\('updates\.cancel'\)/)
})
