import assert from 'node:assert/strict'
import test from 'node:test'
import { loadExternalPreviewImage } from '../src/lib/previewRemoteImage.ts'

test('loadExternalPreviewImage falls back to the original url outside Tauri', async () => {
  const source = 'https://example.com/assets/hero.png'

  assert.equal(await loadExternalPreviewImage(source), source)
})
