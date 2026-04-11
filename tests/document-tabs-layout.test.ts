import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('document tabs stay horizontal-only so the tab strip cannot render a vertical scrollbar', async () => {
  const tabs = await readFile(new URL('../src/components/DocumentTabs/DocumentTabs.tsx', import.meta.url), 'utf8')

  assert.match(tabs, /className="flex min-w-0 flex-shrink-0 items-end overflow-x-auto overflow-y-hidden px-3"/)
})
