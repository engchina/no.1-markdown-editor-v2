import assert from 'node:assert/strict'
import test from 'node:test'
import { access, readFile } from 'node:fs/promises'

test('editor store derives sidebar IDs from the shared surface registry and app removes AI from the sidebar surface', async () => {
  const [store, sidebarRegistry, sidebar, surfaces, commands, palette, app] = await Promise.all([
    readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/sidebarSurfaces.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar/surfaces.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(store, /import \{ isSidebarSurfaceId, type SidebarSurfaceId \} from '\.\.\/lib\/sidebarSurfaces\.ts'/)
  assert.match(store, /export type SidebarTab = SidebarSurfaceId/)
  assert.match(store, /function sanitizeSidebarTab\(value: unknown\): SidebarTab/)
  assert.match(store, /if \(value === 'ai' \|\| value === 'links' \|\| value === 'inspect' \|\| value === 'assets' \|\| value === 'health'\) \{/)
  assert.match(store, /return 'outline'/)
  assert.match(store, /return isSidebarSurfaceId\(value\) \? value : 'outline'/)
  assert.match(store, /sidebarTab: sanitizeSidebarTab\(persistedState\?\.sidebarTab\)/)

  assert.match(sidebarRegistry, /export const SIDEBAR_SURFACE_IDS = \[/)
  assert.match(sidebarRegistry, /'outline'/)
  assert.match(sidebarRegistry, /'files'/)
  assert.match(sidebarRegistry, /'search'/)
  assert.match(sidebarRegistry, /'recent'/)
  assert.doesNotMatch(sidebarRegistry, /'links'/)
  assert.doesNotMatch(sidebarRegistry, /'inspect'/)
  assert.match(sidebarRegistry, /export function getSidebarSurfaceCommandId/)
  assert.match(sidebarRegistry, /export function getSidebarSurfaceCommandPriority/)

  assert.match(sidebar, /data-sidebar-tab=\{surface\.id\}/)
  assert.match(surfaces, /SIDEBAR_SURFACE_META\.map\(\(surface\) => \(\{/)
  assert.match(surfaces, /component: SIDEBAR_SURFACE_COMPONENTS\[surface\.id\]/)
  assert.doesNotMatch(surfaces, /LinksPanel/)
  assert.doesNotMatch(surfaces, /InspectPanel/)
  assert.match(commands, /const sidebarSurfaceCommands: Command\[] = SIDEBAR_SURFACE_META\.map/)
  assert.match(commands, /id: getSidebarSurfaceCommandId\(surface\.id\)/)
  assert.match(commands, /label: t\('commands\.openSidebarSurface', \{ name: t\(surface\.titleKey\) \}\)/)
  assert.match(commands, /store\.setSidebarTab\(surface\.id\)/)
  assert.match(palette, /getSidebarSurfaceCommandPriority\(command\.id\)/)
  assert.match(palette, /getSidebarSurfaceIdFromCommandId\(command\.id\)/)
  assert.doesNotMatch(sidebar, /AISidebarPanel/)
  assert.doesNotMatch(surfaces, /AISidebarPanel/)
  assert.match(app, /<Sidebar width=\{resolvedSidebarWidth\} \/>/)
  assert.doesNotMatch(app, /AISidebarPeekRail/)
  assert.doesNotMatch(app, /aiPeekView/)
})

test('sidebar-specific AI components and locale keys are removed', async () => {
  const [enRaw, jaRaw, zhRaw, aiTypes] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/ai/types.ts', import.meta.url), 'utf8'),
  ])

  await Promise.all([
    assert.rejects(access(new URL('../src/components/Sidebar/AISidebarPanel.tsx', import.meta.url))),
    assert.rejects(access(new URL('../src/components/Sidebar/AISidebarPeekRail.tsx', import.meta.url))),
    assert.rejects(access(new URL('../src/components/Sidebar/aiSidebarShared.ts', import.meta.url))),
  ])

  const en = JSON.parse(enRaw) as Record<string, unknown>
  const ja = JSON.parse(jaRaw) as Record<string, unknown>
  const zh = JSON.parse(zhRaw) as Record<string, unknown>

  for (const locale of [en, ja, zh]) {
    assert.equal((locale.sidebar as Record<string, unknown>).ai, undefined)
    assert.equal((locale.sidebar as Record<string, unknown>).links, undefined)
    assert.equal((locale.sidebar as Record<string, unknown>).inspect, undefined)
    assert.equal((locale.sidebar as Record<string, unknown>).assets, undefined)
    assert.equal((locale.sidebar as Record<string, unknown>).health, undefined)
    assert.equal((locale.sidebar as Record<string, unknown>).returnToEditor, undefined)
    assert.equal((locale.commands as Record<string, unknown>).openSidebarLinks, undefined)
    assert.equal((locale.commands as Record<string, unknown>).openSidebarAssets, undefined)
    assert.equal((locale.commands as Record<string, unknown>).openSidebarHealth, undefined)
    assert.equal((locale.ai as Record<string, unknown>).sidebar, undefined)
    assert.equal(((locale.ai as Record<string, unknown>).source as Record<string, unknown>)['sidebar-tab'], undefined)
  }

  assert.doesNotMatch(aiTypes, /sidebar-tab/)
})
