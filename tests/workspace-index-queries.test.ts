import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkspaceIndexDocument } from '../src/lib/workspaceIndex/analysis.ts'
import {
  getWorkspaceAssetReferences,
  getWorkspaceAssetRepairCandidates,
  getWorkspaceBacklinks,
  getWorkspaceBrokenDocumentLinks,
  getWorkspaceDocumentLinkRepairCandidates,
  getWorkspaceHealthFindings,
  getWorkspaceMissingAssetReferences,
  getWorkspaceOutgoingDocumentLinks,
  getWorkspaceOrphanedAssets,
  getWorkspaceUnlinkedMentions,
  type WorkspaceIndexSnapshot,
} from '../src/lib/workspaceIndex/index.ts'

function createSnapshot(): {
  snapshot: WorkspaceIndexSnapshot
  contentByPath: Map<string, string>
} {
  const contentByPath = new Map<string, string>([
    [
      'notes/intro.md',
      [
        '# Intro',
        '',
        'See [Guide](./guide.md#guide-heading) and [[Roadmap#Roadmap]].',
        'Broken [Missing](./missing.md).',
        'Referenced note[^missing].',
        '',
        '![Hero](./images/hero.png)',
        '![Missing](./images/missing.png)',
        '![](./images/no-alt.png)',
        '[Spec](./files/spec.pdf)',
        '[Deck](./files/deck.pdf)',
      ].join('\n'),
    ],
    [
      'notes/guide.md',
      [
        '# Guide',
        '',
        '## Guide Heading',
        '',
        'Back to [Intro](./intro.md).',
      ].join('\n'),
    ],
    [
      'notes/Roadmap.md',
      [
        '# Roadmap',
        '',
        '## Roadmap',
      ].join('\n'),
    ],
    [
      'notes/review.md',
      [
        '# Review',
        '',
        'Intro is mentioned here without a link.',
      ].join('\n'),
    ],
    [
      'notes/missing-guide.md',
      [
        '# Missing Guide',
        '',
        'Fallback replacement candidate.',
      ].join('\n'),
    ],
    [
      'notes/meta.md',
      [
        '---',
        'title: Meta',
        'title: Meta Again',
        '---',
        '',
        '# Metadata',
      ].join('\n'),
    ],
  ])

  const documents = Array.from(contentByPath.entries())
    .map(([path, content]) => buildWorkspaceIndexDocument(path, content))
    .sort((left, right) => left.path.localeCompare(right.path))

  return {
    snapshot: {
      rootPath: 'notes',
      generatedAt: Date.now(),
      documents,
      files: [
        { path: 'notes/guide.md', name: 'guide.md' },
        { path: 'notes/assets/deck.pdf', name: 'deck.pdf' },
        { path: 'notes/assets/missing.png', name: 'missing.png' },
        { path: 'notes/files/spec.pdf', name: 'spec.pdf' },
        { path: 'notes/images/hero.png', name: 'hero.png' },
        { path: 'notes/images/no-alt.png', name: 'no-alt.png' },
        { path: 'notes/images/orphan.png', name: 'orphan.png' },
        { path: 'notes/intro.md', name: 'intro.md' },
        { path: 'notes/meta.md', name: 'meta.md' },
        { path: 'notes/missing-guide.md', name: 'missing-guide.md' },
        { path: 'notes/Roadmap.md', name: 'Roadmap.md' },
        { path: 'notes/review.md', name: 'review.md' },
      ],
    },
    contentByPath,
  }
}

test('workspace index queries resolve outgoing links and backlinks across markdown links and wikilinks', async () => {
  const { snapshot, contentByPath } = createSnapshot()

  const outgoing = getWorkspaceOutgoingDocumentLinks(snapshot, 'notes/intro.md')
  assert.deepEqual(
    outgoing.map((entry) => [entry.target, entry.resolvedPath, entry.resolvedHeadingLine, entry.broken, entry.ambiguous]),
    [
      ['./guide.md#guide-heading', 'notes/guide.md', 3, false, false],
      ['Roadmap#Roadmap', 'notes/Roadmap.md', 1, false, false],
      ['./missing.md', null, null, true, false],
    ]
  )
  assert.ok(outgoing.every((entry) => entry.sourceStart >= 0 && entry.sourceEnd > entry.sourceStart))

  const backlinks = getWorkspaceBacklinks(snapshot, 'notes/intro.md')
  assert.deepEqual(
    backlinks.map((entry) => [entry.sourcePath, entry.target]),
    [['notes/guide.md', './intro.md']]
  )

  const mentions = await getWorkspaceUnlinkedMentions(
    snapshot,
    'notes/intro.md',
    async (documentPath) => contentByPath.get(documentPath) ?? null
  )
  assert.deepEqual(
    mentions.map((entry) => [entry.sourcePath, entry.line, entry.matchedText]),
    [['notes/review.md', 3, 'Intro']]
  )

  const brokenLinks = getWorkspaceBrokenDocumentLinks(snapshot)
  assert.deepEqual(
    brokenLinks.map((entry) => [entry.sourcePath, entry.target]),
    [['notes/intro.md', './missing.md']]
  )
  const brokenLinkRepairCandidates = getWorkspaceDocumentLinkRepairCandidates(snapshot, 'notes/intro.md', brokenLinks[0]!)
  assert.deepEqual(
    brokenLinkRepairCandidates.map((entry) => [entry.path, entry.replacementTarget]),
    [['notes/missing-guide.md', './missing-guide.md']]
  )
})

test('workspace index queries resolve local assets and aggregate health findings', () => {
  const { snapshot } = createSnapshot()

  const assets = getWorkspaceAssetReferences(snapshot, 'notes/intro.md')
  assert.deepEqual(
    assets.map((entry) => [entry.source, entry.resolvedPath, entry.missing]),
    [
      ['./images/hero.png', 'notes/images/hero.png', false],
      ['./images/missing.png', 'notes/images/missing.png', true],
      ['./images/no-alt.png', 'notes/images/no-alt.png', false],
      ['./files/spec.pdf', 'notes/files/spec.pdf', false],
      ['./files/deck.pdf', 'notes/files/deck.pdf', true],
    ]
  )

  const missingAssets = getWorkspaceMissingAssetReferences(snapshot)
  assert.deepEqual(
    missingAssets.map((entry) => [entry.documentPath, entry.source]),
    [
      ['notes/intro.md', './images/missing.png'],
      ['notes/intro.md', './files/deck.pdf'],
    ]
  )

  const repairCandidates = getWorkspaceAssetRepairCandidates(snapshot, 'notes/intro.md', missingAssets[0])
  assert.deepEqual(
    repairCandidates.map((entry) => [entry.path, entry.relativeSource]),
    [['notes/assets/missing.png', './assets/missing.png']]
  )

  const attachmentRepairCandidates = getWorkspaceAssetRepairCandidates(snapshot, 'notes/intro.md', missingAssets[1])
  assert.deepEqual(
    attachmentRepairCandidates.map((entry) => [entry.path, entry.relativeSource]),
    [['notes/assets/deck.pdf', './assets/deck.pdf']]
  )

  const orphanedAssets = getWorkspaceOrphanedAssets(snapshot)
  assert.deepEqual(
    orphanedAssets.map((entry) => [entry.path, entry.name, entry.kind]),
    [
      ['notes/assets/deck.pdf', 'deck.pdf', 'attachment'],
      ['notes/assets/missing.png', 'missing.png', 'image'],
      ['notes/images/orphan.png', 'orphan.png', 'image'],
    ]
  )

  const findings = getWorkspaceHealthFindings(snapshot)
  assert.deepEqual(
    findings.map((entry) => [entry.documentPath, entry.kind, entry.line]).sort(),
    [
      ['notes/intro.md', 'broken-link', 4],
      ['notes/intro.md', 'missing-asset', 8],
      ['notes/intro.md', 'missing-asset', 11],
      ['notes/intro.md', 'missing-image-alt', 9],
      ['notes/intro.md', 'unresolved-footnote', 5],
      ['notes/Roadmap.md', 'duplicate-heading', 3],
      ['notes/meta.md', 'frontmatter-warning', 3],
      ['notes/meta.md', 'publish-warning', 2],
    ].sort()
  )
})
