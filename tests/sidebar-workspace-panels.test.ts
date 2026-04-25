import assert from 'node:assert/strict'
import test from 'node:test'
import { access, readFile } from 'node:fs/promises'

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

test('links and inspect sidebar implementation files are removed', async () => {
  const surfaces = await readFile(new URL('../src/components/Sidebar/surfaces.ts', import.meta.url), 'utf8')

  await Promise.all([
    assert.rejects(access(new URL('../src/components/Sidebar/LinksPanel.tsx', import.meta.url))),
    assert.rejects(access(new URL('../src/components/Sidebar/InspectPanel.tsx', import.meta.url))),
    assert.rejects(access(new URL('../src/components/Sidebar/AssetsPanel.tsx', import.meta.url))),
    assert.rejects(access(new URL('../src/components/Sidebar/HealthPanel.tsx', import.meta.url))),
  ])

  assert.doesNotMatch(surfaces, /LinksPanel/)
  assert.doesNotMatch(surfaces, /InspectPanel/)
})

test('workspace index hook reuses cached snapshots before refreshing asynchronously', async () => {
  const [hook, index] = await Promise.all([
    readFile(new URL('../src/hooks/useWorkspaceIndex.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/workspaceIndex/index.ts', import.meta.url), 'utf8'),
  ])

  assert.match(index, /peekSnapshot\(rootPath: string\): WorkspaceIndexSnapshot \| null/)
  assert.match(index, /export function peekWorkspaceIndexSnapshot\(rootPath: string\): WorkspaceIndexSnapshot \| null/)
  assert.match(hook, /peekWorkspaceIndexSnapshot/)
  assert.match(hook, /const cachedSnapshot = peekWorkspaceIndexSnapshot\(deferredRootPath\)/)
  assert.match(hook, /setBaseSnapshot\(cachedSnapshot\)/)
  assert.match(hook, /setLoading\(false\)/)
})

test('locales no longer expose removed links and inspect sidebar copy', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const locales = [JSON.parse(enRaw), JSON.parse(jaRaw), JSON.parse(zhRaw)] as Array<Record<string, unknown>>
  const removedKeys = [
    'sidebar.links',
    'sidebar.assets',
    'sidebar.health',
    'sidebar.inspect',
    'sidebar.workspaceRequiredTitle',
    'sidebar.workspaceRequiredDetail',
    'sidebar.savedNoteRequiredTitle',
    'sidebar.savedNoteRequiredDetail',
    'sidebar.filterAll',
    'sidebar.filteredPanelEmpty',
    'sidebar.returnToEditor',
    'sidebar.linksPanelDetail',
    'sidebar.noLinks',
    'sidebar.noLinksDetail',
    'sidebar.linksOutgoing',
    'sidebar.linksBacklinks',
    'sidebar.linksMentions',
    'sidebar.linksBroken',
    'sidebar.linksProblemAlert',
    'sidebar.linksRepairSuggestions',
    'sidebar.linkStatusResolved',
    'sidebar.linkStatusBroken',
    'sidebar.anchorLabel',
    'sidebar.assetsPanelDetail',
    'sidebar.noAssets',
    'sidebar.noAssetsDetail',
    'sidebar.assetsLocal',
    'sidebar.assetsRemote',
    'sidebar.assetsMissing',
    'sidebar.assetsOrphaned',
    'sidebar.assetsReferences',
    'sidebar.assetsRepairSuggestions',
    'sidebar.assetsProblemAlert',
    'sidebar.assetsRevealInFolder',
    'sidebar.assetPathUnavailable',
    'sidebar.assetStatusMissing',
    'sidebar.assetStatusLocal',
    'sidebar.assetStatusRemote',
    'sidebar.assetStatusOrphaned',
    'sidebar.assetKind',
    'sidebar.inspectPanelDetail',
    'sidebar.healthPanelDetail',
    'sidebar.noHealthIssues',
    'sidebar.noHealthIssuesDetail',
    'sidebar.healthCurrent',
    'sidebar.healthWorkspace',
    'sidebar.healthTotal',
    'sidebar.healthCurrentIssues',
    'sidebar.healthWorkspaceIssues',
    'sidebar.healthProblemAlert',
    'sidebar.healthActionAddAltText',
    'sidebar.healthActionRepairAsset',
    'sidebar.healthActionOpenAssets',
    'sidebar.healthActionOpenLinks',
    'sidebar.healthActionRenameDuplicateHeading',
    'sidebar.healthActionAddFootnoteDefinition',
    'sidebar.healthActionFillFrontMatterTitle',
    'sidebar.healthActionInsertTitleHeading',
    'sidebar.healthBatchFixTitle',
    'sidebar.healthBatchFixDetail',
    'sidebar.healthBatchFixApply',
    'sidebar.healthBatchFixAppliedSummary',
    'sidebar.healthBatchFixCategoryAltText',
    'sidebar.healthBatchFixCategoryAssets',
    'sidebar.healthBatchFixCategoryLinks',
    'sidebar.healthBatchFixCategoryHeadings',
    'sidebar.healthBatchFixCategoryFootnotes',
    'sidebar.healthBatchFixCategoryFrontMatter',
    'sidebar.healthBatchFixCategoryTitle',
    'sidebar.healthFixSummaryAltText',
    'sidebar.healthFixSummaryAsset',
    'sidebar.healthFixSummaryLink',
    'sidebar.healthFixSummaryDuplicateHeading',
    'sidebar.healthFixSummaryFootnoteDefinition',
    'sidebar.healthFixSummaryFrontMatterTitle',
    'sidebar.healthFixSummaryTitleHeading',
    'sidebar.healthFixConflictDetail',
    'sidebar.healthFixRewriteDetail',
    'sidebar.healthKind',
    'sidebar.lineLabel',
    'commands.openSidebarLinks',
    'commands.openSidebarAssets',
    'commands.openSidebarHealth',
    'notices.assetRepairSuccessTitle',
    'notices.assetRepairSuccessMessage',
    'notices.assetRepairErrorTitle',
    'notices.assetRepairErrorMessage',
    'notices.linkRepairSuccessTitle',
    'notices.linkRepairSuccessMessage',
    'notices.linkRepairErrorTitle',
    'notices.linkRepairErrorMessage',
    'notices.healthFixAppliedTitle',
    'notices.healthFixAppliedMessage',
    'notices.healthFixErrorTitle',
    'notices.healthFixErrorMessage',
  ]

  for (const locale of locales) {
    for (const key of removedKeys) {
      assert.equal(getNestedValue(locale, key), undefined, key)
    }
  }
})
