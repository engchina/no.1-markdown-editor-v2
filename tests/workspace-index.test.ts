import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkspaceIndexDocument } from '../src/lib/workspaceIndex/analysis.ts'
import { createWorkspaceIndexStore } from '../src/lib/workspaceIndex/index.ts'

test('buildWorkspaceIndexDocument extracts metadata for headings, links, assets, front matter, and duplicate headings', () => {
  const document = buildWorkspaceIndexDocument(
    'notes/project-plan.md',
    [
      '---',
      'title: Intro',
      'tags:',
      '  - ship',
      'summary: Ready',
      '---',
      '',
      '# Intro',
      '',
      'See [Guide](./guide.md) and [[Roadmap]].',
      '',
      '![Hero](./images/hero.png)',
      '[Spec](./files/spec.pdf)',
      '<img src="./images/cover.png" alt="Cover">',
      '',
      '## Intro',
    ].join('\n')
  )

  assert.equal(document.name, 'project-plan.md')
  assert.equal(document.title, 'Intro')
  assert.deepEqual(document.frontMatter?.keys, ['title', 'tags', 'summary'])
  assert.deepEqual(
    document.links.map((entry) => entry.target),
    ['./guide.md', 'Roadmap', './files/spec.pdf']
  )
  assert.ok(document.links.every((entry) => entry.sourceStart >= 0 && entry.sourceEnd > entry.sourceStart))
  assert.deepEqual(
    document.assets.map((entry) => [entry.source, entry.kind, entry.altText]),
    [
      ['./images/hero.png', 'markdown-image', 'Hero'],
      ['./files/spec.pdf', 'markdown-attachment', null],
      ['./images/cover.png', 'html-image', 'Cover'],
    ]
  )
  assert.equal('content' in document, false)
  assert.ok(document.assets.every((entry) => entry.sourceStart >= 0 && entry.sourceEnd > entry.sourceStart))
  assert.equal(document.diagnostics.length, 1)
  assert.equal(document.diagnostics[0]?.kind, 'duplicate-heading')
  assert.equal(document.diagnostics[0]?.heading, 'Intro')
})

test('buildWorkspaceIndexDocument detects missing alt text, unresolved footnotes, and front matter warnings', () => {
  const document = buildWorkspaceIndexDocument(
    'notes/quality-check.md',
    [
      '---',
      'title: First',
      'title: Second',
      '---',
      '',
      '# First',
      '',
      'Reference[^missing].',
      '',
      '![](./images/no-alt.png)',
      '<img src="./images/cover.png">',
      '',
      '[^orphan]: orphaned definition',
      '[^orphan]: duplicated definition',
    ].join('\n')
  )

  assert.deepEqual(
    document.assets.map((entry) => [entry.source, entry.altText]),
    [
      ['./images/no-alt.png', ''],
      ['./images/cover.png', ''],
    ]
  )
  assert.deepEqual(
    document.diagnostics.map((entry) => [entry.kind, entry.line]),
    [
      ['missing-image-alt', 10],
      ['missing-image-alt', 11],
      ['unresolved-footnote', 8],
      ['unresolved-footnote', 13],
      ['unresolved-footnote', 14],
      ['frontmatter-warning', 3],
    ]
  )
})

test('buildWorkspaceIndexDocument detects export and publish warnings for mismatched titles, remote images, and missing top-level titles', () => {
  const publishDocument = buildWorkspaceIndexDocument(
    'notes/publish.md',
    [
      '---',
      'title: Project Plan',
      '---',
      '',
      '# Intro',
      '',
      '![Remote](https://example.com/cover.png)',
      '<img src="//cdn.example.com/banner.png" alt="Banner">',
    ].join('\n')
  )

  assert.deepEqual(
    publishDocument.diagnostics.map((entry) => [entry.kind, entry.line]),
    [
      ['publish-warning', 2],
      ['publish-warning', 7],
      ['publish-warning', 8],
    ]
  )

  const untitledDocument = buildWorkspaceIndexDocument(
    'notes/untitled-fragment.md',
    [
      '## Nested Section',
      '',
      'Body copy.',
    ].join('\n')
  )

  assert.deepEqual(
    untitledDocument.diagnostics.map((entry) => [entry.kind, entry.line]),
    [['publish-warning', 1]]
  )
})

test('buildWorkspaceIndexDocument flags unclosed front matter blocks', () => {
  const document = buildWorkspaceIndexDocument(
    'notes/broken-frontmatter.md',
    ['---', 'title: Broken', '', '# Heading'].join('\n')
  )

  assert.equal(document.diagnostics.length, 1)
  assert.equal(document.diagnostics[0]?.kind, 'frontmatter-warning')
  assert.equal(document.diagnostics[0]?.line, 1)
})

test('workspace index store reuses cached snapshots and incrementally refreshes invalidated paths', async () => {
  let scanCount = 0
  let readCount = 0
  const files = new Map<string, string>([
    ['notes/one.md', '# One'],
    ['notes/two.md', '# Two'],
  ])

  const store = createWorkspaceIndexStore({
    scanRoot: async () => {
      scanCount += 1
      return {
        rootPath: 'notes',
        generatedAt: Date.now(),
        documents: Array.from(files.entries()).map(([path, content]) => buildWorkspaceIndexDocument(path, content)),
        files: Array.from(files.keys()).map((path) => ({
          path,
          name: path.split('/').pop() ?? path,
        })),
      }
    },
    readDocument: async (path) => {
      readCount += 1
      const content = files.get(path)
      if (content === undefined) throw new Error(`Missing ${path}`)
      return content
    },
    documentExists: async (path) => files.has(path),
  })

  const firstSnapshot = await store.getSnapshot('notes')
  assert.equal(scanCount, 1)
  assert.equal(readCount, 0)
  assert.deepEqual(
    firstSnapshot.documents.map((document) => document.path),
    ['notes/one.md', 'notes/two.md']
  )
  assert.deepEqual(
    firstSnapshot.files.map((file) => file.path),
    ['notes/one.md', 'notes/two.md']
  )

  const cachedSnapshot = await store.getSnapshot('notes')
  assert.equal(scanCount, 1)
  assert.equal(cachedSnapshot.documents[1]?.title, 'Two')
  assert.equal('content' in cachedSnapshot.documents[0]!, false)

  const firstContentLoad = await store.getDocumentContent('notes', 'notes/two.md')
  const cachedContentLoad = await store.getDocumentContent('notes', 'notes/two.md')
  assert.equal(firstContentLoad, '# Two')
  assert.equal(cachedContentLoad, '# Two')
  assert.equal(readCount, 1)

  files.set('notes/two.md', '# Two Updated')
  store.invalidatePaths('notes', ['notes/two.md'])
  const refreshedSnapshot = await store.getSnapshot('notes')
  assert.equal(scanCount, 1)
  assert.equal(readCount, 2)
  assert.equal(
    refreshedSnapshot.documents.find((document) => document.path === 'notes/two.md')?.title,
    'Two Updated'
  )

  const refreshedContentLoad = await store.getDocumentContent('notes', 'notes/two.md')
  assert.equal(refreshedContentLoad, '# Two Updated')
  assert.equal(readCount, 3)

  files.delete('notes/one.md')
  store.invalidatePaths('notes', ['notes/one.md'])
  const deletedSnapshot = await store.getSnapshot('notes')
  assert.equal(
    deletedSnapshot.documents.some((document) => document.path === 'notes/one.md'),
    false
  )

  store.invalidateRoot('notes')
  await store.getSnapshot('notes')
  assert.equal(scanCount, 2)
})
