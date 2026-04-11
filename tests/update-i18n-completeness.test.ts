import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

function collectNestedKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  const entries = Object.entries(value as Record<string, unknown>)
  return entries.flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key
    const nested = collectNestedKeys(child, next)
    return nested.length > 0 ? nested : [next]
  })
}

function pickUpdateSubset(locale: Record<string, unknown>) {
  const commands = locale.commands as Record<string, unknown> | undefined
  const notices = locale.notices as Record<string, unknown> | undefined

  return {
    updates: locale.updates,
    commands: {
      checkForUpdates: commands?.checkForUpdates,
    },
    notices: Object.fromEntries(
      Object.entries(notices ?? {}).filter(([key]) => key.startsWith('update'))
    ),
  }
}

test('update copy is structurally complete across en, ja, and zh locales', async () => {
  const [enRaw, jaRaw, zhRaw] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
  ])

  const en = pickUpdateSubset(JSON.parse(enRaw))
  const ja = pickUpdateSubset(JSON.parse(jaRaw))
  const zh = pickUpdateSubset(JSON.parse(zhRaw))

  const enKeys = collectNestedKeys(en).sort()
  const jaKeys = collectNestedKeys(ja).sort()
  const zhKeys = collectNestedKeys(zh).sort()

  assert.deepEqual(jaKeys, enKeys)
  assert.deepEqual(zhKeys, enKeys)
})
