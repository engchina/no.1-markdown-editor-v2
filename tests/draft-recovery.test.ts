import test from 'node:test'
import assert from 'node:assert/strict'
import {
  countRestorableDraftTabs,
  isRestorableDraftTab,
  restoreDraftTabs,
  type RestorableDraftTab,
} from '../src/lib/draftRecovery.ts'

interface TestTab extends RestorableDraftTab {
  name: string
}

test('isRestorableDraftTab only restores non-empty scratch tabs', () => {
  assert.equal(isRestorableDraftTab({ id: 'a', path: null, content: 'Draft body' }), true)
  assert.equal(isRestorableDraftTab({ id: 'b', path: null, content: '   \n  ' }), false)
  assert.equal(isRestorableDraftTab({ id: 'c', path: 'notes.md', content: 'Unsaved file edits' }), false)
})

test('restoreDraftTabs keeps persisted scratch drafts and active tab when valid', () => {
  const persistedTabs: TestTab[] = [
    { id: 'draft-1', path: null, content: 'First draft', name: 'Untitled' },
    { id: 'draft-2', path: null, content: 'Second draft', name: 'Untitled' },
    { id: 'saved-file', path: 'notes.md', content: 'Should be filtered', name: 'notes.md' },
  ]

  const restored = restoreDraftTabs(
    { tabs: persistedTabs, activeTabId: 'draft-2' },
    {
      tabs: [{ id: 'current', path: null, content: '', name: 'Untitled' }],
      activeTabId: 'current',
    }
  )

  assert.deepEqual(
    restored.tabs.map((tab) => tab.id),
    ['draft-1', 'draft-2']
  )
  assert.equal(restored.activeTabId, 'draft-2')
})

test('restoreDraftTabs falls back to current state when persisted drafts are empty', () => {
  const restored = restoreDraftTabs(
    {
      tabs: [
        { id: 'empty', path: null, content: '   ', name: 'Untitled' },
        { id: 'saved', path: 'notes.md', content: 'Saved file', name: 'notes.md' },
      ],
      activeTabId: 'missing',
    },
    {
      tabs: [{ id: 'current', path: null, content: '', name: 'Untitled' }],
      activeTabId: 'current',
    }
  )

  assert.deepEqual(restored.tabs.map((tab) => tab.id), ['current'])
  assert.equal(restored.activeTabId, 'current')
  assert.equal(countRestorableDraftTabs(restored.tabs), 0)
})
