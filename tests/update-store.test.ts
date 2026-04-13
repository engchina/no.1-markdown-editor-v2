import assert from 'node:assert/strict'
import test from 'node:test'
import { UPDATE_CHECK_INTERVAL_MS, shouldAutoCheckUpdates, shouldShowUpdateDialog, type AvailableRelease } from '../src/lib/update.ts'
import { useUpdateStore } from '../src/store/update.ts'

const SAMPLE_RELEASE: AvailableRelease = {
  currentVersion: '0.12.0',
  latestVersion: '0.13.0',
  hasUpdate: true,
  releaseUrl: 'https://github.com/engchina/no.1-markdown-editor/releases/tag/v0.13.0',
  downloadUrl: 'https://github.com/engchina/no.1-markdown-editor/releases/download/v0.13.0/app.msi',
  assetName: 'app.msi',
  releaseNotes: '## Changes\n- Update flow',
  publishedAt: '2026-04-11T00:00:00Z',
}

test('shouldAutoCheckUpdates respects the 24 hour launch cooldown', () => {
  const now = 1_700_000_000_000

  assert.equal(shouldAutoCheckUpdates(true, null, now), true)
  assert.equal(shouldAutoCheckUpdates(true, now - UPDATE_CHECK_INTERVAL_MS + 1, now), false)
  assert.equal(shouldAutoCheckUpdates(true, now - UPDATE_CHECK_INTERVAL_MS, now), true)
  assert.equal(shouldAutoCheckUpdates(false, null, now), false)
})

test('manual checks ignore skippedVersion while automatic checks honor it', () => {
  assert.equal(shouldShowUpdateDialog('auto', '0.13.0', '0.13.0'), false)
  assert.equal(shouldShowUpdateDialog('manual', '0.13.0', '0.13.0'), true)
  assert.equal(shouldShowUpdateDialog('auto', '0.13.0', '0.11.0'), true)
})

test('skipVersion stores the skipped release and closes the update dialog', () => {
  useUpdateStore.setState({
    autoCheckEnabled: true,
    lastCheckedAt: null,
    skippedVersion: null,
    isChecking: false,
    dialogOpen: false,
    availableRelease: null,
    lastError: null,
  })

  useUpdateStore.getState().openUpdateDialog(SAMPLE_RELEASE)
  assert.equal(useUpdateStore.getState().dialogOpen, true)
  assert.equal(useUpdateStore.getState().availableRelease?.latestVersion, '0.13.0')

  useUpdateStore.getState().skipVersion('0.13.0')
  assert.equal(useUpdateStore.getState().skippedVersion, '0.13.0')
  assert.equal(useUpdateStore.getState().dialogOpen, false)
  assert.equal(useUpdateStore.getState().availableRelease, null)
})
