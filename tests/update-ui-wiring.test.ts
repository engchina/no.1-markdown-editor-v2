import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('App lazily mounts rare dialogs while still triggering the automatic update check on startup', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(app, /const UpdateAvailableDialog = lazy\(\(\) => import\('\.\/components\/Updates\/UpdateAvailableDialog'\)\)/)
  assert.match(app, /const ExternalMissingFileDialog = lazy\(\(\) => import\('\.\/components\/ExternalFileConflicts\/ExternalMissingFileDialog'\)\)/)
  assert.match(app, /const ExternalFileConflictDialog = lazy\(\(\) => import\('\.\/components\/ExternalFileConflicts\/ExternalFileConflictDialog'\)\)/)
  assert.match(app, /const updateDialogOpen = useUpdateStore\(\(state\) => state\.dialogOpen\)/)
  assert.match(app, /const externalMissingDialogOpen = useEditorStore\(\(state\) => state\.externalMissingFiles\.length > 0\)/)
  assert.match(
    app,
    /const externalConflictDialogOpen = useEditorStore\(\s*\(state\) => state\.externalMissingFiles\.length === 0 && state\.externalFileConflicts\.length > 0\s*\)/
  )
  assert.match(app, /import \{ maybeRunAutomaticUpdateCheck \} from '\.\/lib\/updateActions'/)
  assert.match(app, /void maybeRunAutomaticUpdateCheck\(\)/)
  assert.match(app, /\{updateDialogOpen && \(\s*<Suspense fallback=\{null\}>\s*<UpdateAvailableDialog \/>\s*<\/Suspense>\s*\)\}/)
  assert.match(app, /\{externalMissingDialogOpen && \(\s*<Suspense fallback=\{null\}>\s*<ExternalMissingFileDialog \/>\s*<\/Suspense>\s*\)\}/)
  assert.match(app, /\{externalConflictDialogOpen && \(\s*<Suspense fallback=\{null\}>\s*<ExternalFileConflictDialog \/>\s*<\/Suspense>\s*\)\}/)
})

test('toolbar mounts dedicated AI and About panels while theme settings stay editor-only', async () => {
  const toolbar = await readFile(new URL('../src/components/Toolbar/Toolbar.tsx', import.meta.url), 'utf8')
  const panel = await readFile(new URL('../src/components/ThemePanel/ThemePanel.tsx', import.meta.url), 'utf8')
  const aiPanel = await readFile(new URL('../src/components/AI/AISetupPanel.tsx', import.meta.url), 'utf8')
  const aboutPanel = await readFile(new URL('../src/components/Updates/AboutPanel.tsx', import.meta.url), 'utf8')
  const updateSection = await readFile(new URL('../src/components/Updates/UpdateSettingsSection.tsx', import.meta.url), 'utf8')

  assert.match(toolbar, /const ThemePanel = lazy\(\(\) => import\('\.\.\/ThemePanel\/ThemePanel'\)\)/)
  assert.match(toolbar, /const AISetupPanel = lazy\(\(\) => import\('\.\.\/AI\/AISetupPanel'\)\)/)
  assert.match(toolbar, /const AboutPanel = lazy\(\(\) => import\('\.\.\/Updates\/AboutPanel'\)\)/)
  assert.match(toolbar, /data-toolbar-action="ai-setup"/)
  assert.match(toolbar, /data-toolbar-action="about"/)
  assert.match(
    toolbar,
    /\{showTheme && \(\s*<Suspense fallback=\{null\}>\s*<ThemePanel onClose=\{\(\) => setShowTheme\(false\)\} triggerRef=\{themeButtonRef\} \/>\s*<\/Suspense>\s*\)\}/
  )
  assert.match(
    toolbar,
    /\{showAISetup && \(\s*<Suspense fallback=\{null\}>\s*<AISetupPanel onClose=\{\(\) => setShowAISetup\(false\)\} triggerRef=\{aiSetupButtonRef\} \/>\s*<\/Suspense>\s*\)\}/
  )
  assert.match(
    toolbar,
    /\{showAbout && \(\s*<Suspense fallback=\{null\}>\s*<AboutPanel onClose=\{\(\) => setShowAbout\(false\)\} triggerRef=\{aboutButtonRef\} \/>\s*<\/Suspense>\s*\)\}/
  )
  assert.ok(!panel.includes('AISettingsSection'))
  assert.ok(!panel.includes('UpdateSettingsSection'))

  assert.match(aiPanel, /data-ai-setup-panel="true"/)
  assert.match(aiPanel, /<AISettingsSection \/>/)
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
  const aiSetupIndex = toolbar.indexOf('data-toolbar-action="ai-setup"')
  const aboutIndex = toolbar.indexOf('data-toolbar-action="about"')

  assert.notEqual(focusIndex, -1)
  assert.notEqual(sourceIndex, -1)
  assert.notEqual(commandPaletteIndex, -1)
  assert.notEqual(languageIndex, -1)
  assert.notEqual(settingsIndex, -1)
  assert.notEqual(aiSetupIndex, -1)
  assert.notEqual(aboutIndex, -1)

  assert.ok(focusIndex < sourceIndex)
  assert.ok(sourceIndex < commandPaletteIndex)
  assert.ok(commandPaletteIndex < languageIndex)
  assert.ok(languageIndex < settingsIndex)
  assert.ok(settingsIndex < aiSetupIndex)
  assert.ok(aiSetupIndex < aboutIndex)
})

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

test('toolbar AI entry and setup panel locale copy exist across en, ja, and zh', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const locales = [JSON.parse(enRaw), JSON.parse(jaRaw), JSON.parse(zhRaw)] as Array<Record<string, unknown>>
  const keys = ['toolbar.aiSetup', 'ai.setup.title']

  for (const locale of locales) {
    for (const key of keys) {
      assert.equal(typeof getNestedValue(locale, key), 'string', key)
    }
  }

  assert.equal(getNestedValue(locales[0], 'ai.connection.save'), 'Save')
  assert.equal(getNestedValue(locales[1], 'ai.connection.save'), '保存')
  assert.equal(getNestedValue(locales[2], 'ai.connection.save'), '保存')
  assert.equal(getNestedValue(locales[0], 'ai.connection.clearClientSecret'), 'Clear Client Secret')
  assert.equal(getNestedValue(locales[1], 'ai.connection.clearClientSecret'), 'Client Secret を削除')
  assert.equal(getNestedValue(locales[2], 'ai.connection.clearClientSecret'), '清除 Client Secret')
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
