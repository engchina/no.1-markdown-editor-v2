import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkspaceIndexDocument } from '../src/lib/workspaceIndex/analysis.ts'
import type { WorkspaceIndexSnapshot } from '../src/lib/workspaceIndex/index.ts'
import {
  buildWorkspaceAssetRepairPlan,
  countWorkspaceAssetRepairPlanReferences,
  rewriteWorkspaceAssetReferences,
} from '../src/lib/workspaceAssetRepair.ts'

function createSnapshot(): WorkspaceIndexSnapshot {
  const intro = buildWorkspaceIndexDocument(
    'notes/intro.md',
    [
      '# Intro',
      '',
      '![Hero](./images/hero.png)',
      '![Logo](./images/icons/logo.png)',
      '[Spec](./files/spec.pdf#page=2)',
    ].join('\n')
  )

  const chapter = buildWorkspaceIndexDocument(
    'notes\\nested\\chapter.md',
    [
      '# Chapter',
      '',
      '![Hero](../images/hero.png)',
      '[Spec](../files/spec.pdf#page=2)',
    ].join('\n')
  )

  return {
    rootPath: 'notes',
    generatedAt: Date.now(),
    documents: [chapter, intro],
    files: [
      { path: 'notes/images/hero.png', name: 'hero.png' },
      { path: 'notes/images/icons/logo.png', name: 'logo.png' },
      { path: 'notes/files/spec.pdf', name: 'spec.pdf' },
      { path: 'notes/intro.md', name: 'intro.md' },
      { path: 'notes/nested/chapter.md', name: 'chapter.md' },
    ],
  }
}

test('buildWorkspaceAssetRepairPlan remaps asset directory moves across workspace documents', () => {
  const snapshot = createSnapshot()
  const plan = buildWorkspaceAssetRepairPlan(snapshot, 'notes/images', 'notes/media')

  assert.equal(plan.length, 2)
  assert.equal(countWorkspaceAssetRepairPlanReferences(plan), 3)
  assert.deepEqual(
    plan.map((entry) => [entry.documentPath.replace(/\\/gu, '/'), entry.updates.map((update) => update.replacement)]),
    [
      ['notes/intro.md', ['./media/icons/logo.png', './media/hero.png']],
      ['notes/nested/chapter.md', ['../media/hero.png']],
    ]
  )
})

test('rewriteWorkspaceAssetReferences preserves line endings while applying multiple replacements', () => {
  const snapshot = createSnapshot()
  const plan = buildWorkspaceAssetRepairPlan(snapshot, 'notes/images', 'notes/media')
  const introPlan = plan.find((entry) => entry.documentPath === 'notes/intro.md')

  assert.ok(introPlan)

  const original = ['# Intro', '', '![Hero](./images/hero.png)', '![Logo](./images/icons/logo.png)', '[Spec](./files/spec.pdf#page=2)'].join('\r\n')
  const next = rewriteWorkspaceAssetReferences(original, introPlan!.updates)

  assert.equal(
    next,
    ['# Intro', '', '![Hero](./media/hero.png)', '![Logo](./media/icons/logo.png)', '[Spec](./files/spec.pdf#page=2)'].join('\r\n')
  )
})

test('buildWorkspaceAssetRepairPlan preserves query and hash suffixes for attachment references', () => {
  const snapshot = createSnapshot()
  const plan = buildWorkspaceAssetRepairPlan(snapshot, 'notes/files', 'notes/assets/files')

  assert.deepEqual(
    plan.map((entry) => [entry.documentPath.replace(/\\/gu, '/'), entry.updates.map((update) => update.replacement)]),
    [
      ['notes/intro.md', ['./assets/files/spec.pdf#page=2']],
      ['notes/nested/chapter.md', ['../assets/files/spec.pdf#page=2']],
    ]
  )
})
