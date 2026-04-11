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

test('ThemePanel mounts the update settings section inside the settings panel', async () => {
  const panel = await readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8')
  const updateSection = await readFile(new URL('../src/components/Updates/UpdateSettingsSection.tsx', import.meta.url), 'utf8')

  assert.match(panel, /import UpdateSettingsSection from '\.\.\/Updates\/UpdateSettingsSection'/)
  assert.match(panel, /<UpdateSettingsSection \/>/)

  assert.match(updateSection, /data-update-settings="true"/)
  assert.match(updateSection, /t\('updates\.versionLabel'/)
  assert.match(updateSection, /t\('updates\.checkForUpdates'\)/)
  assert.match(updateSection, /t\('updates\.autoCheckOnLaunch'\)/)
  assert.match(updateSection, /t\('updates\.githubReleases'\)/)
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
