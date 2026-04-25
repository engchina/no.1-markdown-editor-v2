import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  SIDEBAR_SURFACE_IDS,
  SIDEBAR_SURFACE_META,
  getSidebarSurfaceCommandId,
  getSidebarSurfaceCommandPriority,
  getSidebarSurfaceIdFromCommandId,
  isSidebarSurfaceId,
} from '../src/lib/sidebarSurfaces.ts'

test('sidebar surface registry exposes a single ordered source of truth for ids and command wiring', () => {
  assert.deepEqual(SIDEBAR_SURFACE_META.map((surface) => surface.id), [...SIDEBAR_SURFACE_IDS])
  assert.equal(new Set(SIDEBAR_SURFACE_IDS).size, SIDEBAR_SURFACE_IDS.length)

  SIDEBAR_SURFACE_IDS.forEach((id, index) => {
    assert.equal(isSidebarSurfaceId(id), true)
    assert.equal(getSidebarSurfaceCommandId(id), `view.sidebar.${id}`)
    assert.equal(getSidebarSurfaceIdFromCommandId(`view.sidebar.${id}`), id)
    assert.equal(getSidebarSurfaceCommandPriority(`view.sidebar.${id}`), 216 + index)
  })

  assert.equal(isSidebarSurfaceId('ai'), false)
  assert.equal(getSidebarSurfaceIdFromCommandId('view.sidebar.ai'), null)
  assert.equal(getSidebarSurfaceCommandPriority('view.sidebar.ai'), null)
})

test('sidebar registry drives renderable surfaces and selectable tabs from shared metadata', async () => {
  const [sidebar, surfaces, commands, palette] = await Promise.all([
    readFile(new URL('../src/components/Sidebar/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar/surfaces.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(sidebar, /const activeSurface = SIDEBAR_SURFACES\.find\(\(surface\) => surface\.id === sidebarTab\)/)
  assert.match(sidebar, /SIDEBAR_SURFACES\.map\(\(surface\) => \{/)
  assert.match(sidebar, /onClick=\{\(\) => setSidebarTab\(surface\.id\)\}/)

  assert.match(surfaces, /const SIDEBAR_SURFACE_COMPONENTS: Record<SidebarSurfaceId, ComponentType> = \{/)
  assert.match(surfaces, /outline: OutlinePanel/)
  assert.match(surfaces, /files: FileTree/)
  assert.match(surfaces, /search: SearchPanel/)
  assert.match(surfaces, /recent: RecentPanel/)
  assert.doesNotMatch(surfaces, /LinksPanel/)
  assert.doesNotMatch(surfaces, /InspectPanel/)
  assert.match(surfaces, /SIDEBAR_SURFACE_META\.map\(\(surface\) => \(\{/)

  assert.match(commands, /SIDEBAR_SURFACE_META\.map\(\(surface\) => \(\{/)
  assert.match(commands, /store\.setSidebarOpen\(true\)/)
  assert.match(commands, /store\.setSidebarTab\(surface\.id\)/)

  assert.match(palette, /getSidebarSurfaceCommandPriority\(command\.id\)/)
  assert.match(palette, /getSidebarSurfaceIdFromCommandId\(command\.id\)/)
  assert.match(palette, /getSidebarSurfaceMeta\(sidebarSurfaceId\)\.icon/)
  assert.deepEqual(SIDEBAR_SURFACE_IDS, ['outline', 'files', 'search', 'recent'])
})

test('sidebar surface command copy exists in en, ja, and zh locales', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const locales = [JSON.parse(enRaw), JSON.parse(jaRaw), JSON.parse(zhRaw)] as Array<Record<string, unknown>>
  for (const locale of locales) {
    const commands = locale.commands as Record<string, unknown>
    assert.equal(typeof commands.openSidebarSurface, 'string')
  }
})
