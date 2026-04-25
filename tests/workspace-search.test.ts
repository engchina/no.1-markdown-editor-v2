import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkspaceIndexDocument } from '../src/lib/workspaceIndex/analysis.ts'
import {
  buildWorkspaceSearchResults,
  findWorkspaceDocumentReferences,
  type WorkspaceSearchRuntime,
} from '../src/lib/workspaceSearch.ts'

test('findWorkspaceDocumentReferences returns matching open-tab notes ordered by name/path relevance', async () => {
  const references = await findWorkspaceDocumentReferences({
    query: 'project plan',
    tabs: [
      {
        id: 'tab-1',
        name: 'current.md',
        path: 'notes/current.md',
        content: '# Current',
      },
      {
        id: 'tab-2',
        name: 'project-plan.md',
        path: 'notes/project-plan.md',
        content: '# Plan\n\nDetails.',
      },
      {
        id: 'tab-3',
        name: 'project-retrospective.md',
        path: 'notes/project-retrospective.md',
        content: '# Retro',
      },
    ],
    rootPath: null,
    limit: 5,
    includeContent: true,
  })

  assert.deepEqual(
    references.map((reference) => reference.name),
    ['project-plan.md']
  )
  assert.equal(references[0]?.content, '# Plan\n\nDetails.')
  assert.equal(references[0]?.confidence, 'high')
  assert.equal(references[0]?.ambiguous, false)
})

test('findWorkspaceDocumentReferences respects excluded note paths when building attachable results', async () => {
  const references = await findWorkspaceDocumentReferences({
    query: 'project',
    tabs: [
      {
        id: 'tab-1',
        name: 'project-plan.md',
        path: 'notes/project-plan.md',
        content: '# Plan',
      },
      {
        id: 'tab-2',
        name: 'project-retrospective.md',
        path: 'notes/project-retrospective.md',
        content: '# Retro',
      },
    ],
    rootPath: null,
    limit: 5,
    excludePaths: ['notes/project-plan.md'],
  })

  assert.deepEqual(
    references.map((reference) => reference.name),
    ['project-retrospective.md']
  )
})

test('findWorkspaceDocumentReferences marks ambiguous broad matches with degraded confidence', async () => {
  const references = await findWorkspaceDocumentReferences({
    query: 'project',
    tabs: [
      {
        id: 'tab-1',
        name: 'project-plan.md',
        path: 'notes/project-plan.md',
        content: '# Plan',
      },
      {
        id: 'tab-2',
        name: 'project-retrospective.md',
        path: 'notes/project-retrospective.md',
        content: '# Retro',
      },
    ],
    rootPath: null,
    limit: 2,
  })

  assert.equal(references.length, 2)
  assert.equal(references[0]?.ambiguous, true)
  assert.equal(references[0]?.confidence, 'low')
  assert.equal(references[1]?.ambiguous, true)
})

test('buildWorkspaceSearchResults still merges open-tab matches and workspace matches without duplicating open files', async () => {
  const contentByPath = new Map<string, string>([
    ['notes/project-plan.md', '# Plan\n\nOpen tab content should win.'],
    ['notes/release-checklist.md', '# Release\n\nProject ship checklist.'],
  ])
  const runtime = createWorkspaceSearchRuntime(contentByPath)

  const results = await buildWorkspaceSearchResults({
    query: 'project',
    tabs: [
      {
        id: 'tab-1',
        name: 'project-plan.md',
        path: 'notes/project-plan.md',
        content: '# Plan\n\nProject stays open here.',
      },
    ],
    rootPath: 'notes',
    limit: 10,
    runtime,
  })

  assert.deepEqual(
    results.map((result) => [result.source, result.path]),
    [
      ['tab', 'notes/project-plan.md'],
      ['workspace', 'notes/release-checklist.md'],
    ]
  )
  assert.equal(runtime.readCount, 1)
})

test('findWorkspaceDocumentReferences keeps workspace content loading lazy until includeContent is requested', async () => {
  const contentByPath = new Map<string, string>([
    ['notes/project-plan.md', '# Plan\n\nProject scope.'],
    ['notes/project-retrospective.md', '# Retro\n\nProject lessons.'],
  ])
  const runtime = createWorkspaceSearchRuntime(contentByPath)

  const withoutContent = await findWorkspaceDocumentReferences({
    query: 'project plan',
    tabs: [],
    rootPath: 'notes',
    limit: 1,
    runtime,
  })

  assert.equal(withoutContent[0]?.name, 'project-plan.md')
  assert.equal(withoutContent[0]?.content, null)
  assert.equal(runtime.readCount, 0)

  const withContent = await findWorkspaceDocumentReferences({
    query: 'project plan',
    tabs: [],
    rootPath: 'notes',
    limit: 1,
    includeContent: true,
    runtime,
  })

  assert.equal(withContent[0]?.name, 'project-plan.md')
  assert.equal(withContent[0]?.content, '# Plan\n\nProject scope.')
  assert.equal(runtime.readCount, 1)
})

function createWorkspaceSearchRuntime(
  contentByPath: Map<string, string>
): WorkspaceSearchRuntime & { readCount: number } {
  let readCount = 0
  const snapshot = {
    rootPath: 'notes',
    generatedAt: 1,
    documents: Array.from(contentByPath.entries())
      .map(([path, content]) => buildWorkspaceIndexDocument(path, content))
      .sort((left, right) => left.path.localeCompare(right.path)),
    files: Array.from(contentByPath.keys()).map((path) => ({
      path,
      name: path.split('/').pop() ?? path,
    })),
  }

  return {
    workspaceEnabled: true,
    getSnapshot: async () => snapshot,
    getDocumentContent: async (_rootPath, documentPath) => {
      readCount += 1
      return contentByPath.get(documentPath) ?? null
    },
    get readCount() {
      return readCount
    },
  }
}
