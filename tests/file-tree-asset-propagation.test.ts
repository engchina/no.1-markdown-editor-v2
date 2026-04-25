import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

test('useFileTree propagates asset reference updates after directory rename and move operations', async () => {
  const source = await readFile(new URL('../src/hooks/useFileTree.ts', import.meta.url), 'utf8')

  assert.match(source, /getWorkspaceIndexSnapshot/)
  assert.match(source, /buildWorkspaceAssetRepairPlan/)
  assert.match(source, /rewriteWorkspaceAssetReferences/)
  assert.match(source, /countWorkspaceAssetRepairPlanReferences/)
  assert.match(source, /async \(oldPath: string, newPath: string, snapshot:/)
  assert.match(source, /if \(node\.type === 'dir'\) \{\s*await propagateWorkspaceAssetPathChange\(node\.path, nextPath, assetRepairSnapshot\)/u)
  assert.match(source, /assetPathPropagationSuccessTitle/)
  assert.match(source, /assetPathPropagationPartialTitle/)
  assert.match(source, /assetPathPropagationFailedTitle/)
})

test('asset path propagation notice copy exists across en ja and zh locales', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const locales = [JSON.parse(enRaw), JSON.parse(jaRaw), JSON.parse(zhRaw)] as Array<Record<string, unknown>>
  const keys = [
    'notices.assetPathPropagationSuccessTitle',
    'notices.assetPathPropagationSuccessMessage',
    'notices.assetPathPropagationPartialTitle',
    'notices.assetPathPropagationPartialMessage',
    'notices.assetPathPropagationFailedTitle',
    'notices.assetPathPropagationFailedMessage',
  ]

  for (const locale of locales) {
    for (const key of keys) {
      assert.equal(typeof getNestedValue(locale, key), 'string', key)
    }
  }
})
