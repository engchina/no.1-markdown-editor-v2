import assert from 'node:assert/strict'
import test from 'node:test'
import { access } from 'node:fs/promises'

test('inspect health fix helpers are removed with the deleted sidebar workflow', async () => {
  await assert.rejects(access(new URL('../src/components/Sidebar/healthFixes.ts', import.meta.url)))
})
