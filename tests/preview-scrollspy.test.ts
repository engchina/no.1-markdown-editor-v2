import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveActiveHeadingId, updateVisibleHeadingIds } from '../src/lib/previewScrollSpy.ts'

test('scrollspy keeps the earlier visible heading active when the next heading enters view', () => {
  const orderedHeadingIds = ['section-4-1', 'section-4-2', 'section-4-3']
  const visibleHeadingIds = new Set<string>()

  updateVisibleHeadingIds(visibleHeadingIds, [{ id: 'section-4-2', isIntersecting: true }])
  assert.equal(resolveActiveHeadingId(orderedHeadingIds, visibleHeadingIds), 'section-4-2')

  updateVisibleHeadingIds(visibleHeadingIds, [{ id: 'section-4-3', isIntersecting: true }])
  assert.equal(resolveActiveHeadingId(orderedHeadingIds, visibleHeadingIds), 'section-4-2')
})

test('scrollspy advances after the active heading leaves view', () => {
  const orderedHeadingIds = ['section-4-1', 'section-4-2', 'section-4-3']
  const visibleHeadingIds = new Set<string>()

  updateVisibleHeadingIds(visibleHeadingIds, [
    { id: 'section-4-2', isIntersecting: true },
    { id: 'section-4-3', isIntersecting: true },
  ])
  assert.equal(resolveActiveHeadingId(orderedHeadingIds, visibleHeadingIds), 'section-4-2')

  updateVisibleHeadingIds(visibleHeadingIds, [{ id: 'section-4-2', isIntersecting: false }])
  assert.equal(resolveActiveHeadingId(orderedHeadingIds, visibleHeadingIds), 'section-4-3')
})
