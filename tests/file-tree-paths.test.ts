import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ensureMarkdownFileName,
  findTreeNodeByPath,
  findTreePathInTree,
  getPathBaseName,
  getParentDirectoryPath,
  pathMatchesPrefix,
  remapPathPrefix,
  validateMoveDestination,
  validateFileTreeEntryName,
} from '../src/lib/fileTreePaths.ts'

test('ensureMarkdownFileName appends a markdown extension when missing', () => {
  assert.equal(ensureMarkdownFileName('notes'), 'notes.md')
  assert.equal(ensureMarkdownFileName('notes.markdown'), 'notes.markdown')
})

test('validateFileTreeEntryName rejects empty reserved and invalid names', () => {
  assert.equal(validateFileTreeEntryName(''), 'empty')
  assert.equal(validateFileTreeEntryName('..'), 'reserved')
  assert.equal(validateFileTreeEntryName('bad/name'), 'invalid')
  assert.equal(validateFileTreeEntryName('draft.md'), null)
})

test('remapPathPrefix remaps exact paths and nested descendants', () => {
  assert.equal(remapPathPrefix('C:\\docs\\a.md', 'C:\\docs\\a.md', 'C:\\docs\\b.md'), 'C:\\docs\\b.md')
  assert.equal(
    remapPathPrefix('C:\\docs\\nested\\a.md', 'C:\\docs\\nested', 'C:\\docs\\archive'),
    'C:\\docs\\archive\\a.md'
  )
  assert.equal(remapPathPrefix('C:\\docs\\other\\a.md', 'C:\\docs\\nested', 'C:\\docs\\archive'), null)
})

test('pathMatchesPrefix uses exact and descendant matches only', () => {
  assert.equal(pathMatchesPrefix('C:\\docs\\nested\\a.md', 'C:\\docs\\nested'), true)
  assert.equal(pathMatchesPrefix('C:\\docs\\nested-2\\a.md', 'C:\\docs\\nested'), false)
})

test('findTreeNodeByPath finds nested nodes recursively', () => {
  const tree = [
    {
      name: 'docs',
      path: '/docs',
      type: 'dir' as const,
      children: [
        {
          name: 'a.md',
          path: '/docs/a.md',
          type: 'file' as const,
        },
      ],
    },
  ]

  assert.deepEqual(findTreeNodeByPath(tree, '/docs/a.md'), tree[0].children[0])
  assert.equal(findTreeNodeByPath(tree, '/missing'), null)
})

test('findTreePathInTree returns the index trail for nested nodes', () => {
  const tree = [
    {
      name: 'docs',
      path: '/docs',
      type: 'dir' as const,
      children: [
        {
          name: 'nested',
          path: '/docs/nested',
          type: 'dir' as const,
          children: [
            {
              name: 'a.md',
              path: '/docs/nested/a.md',
              type: 'file' as const,
            },
          ],
        },
      ],
    },
  ]

  assert.deepEqual(findTreePathInTree(tree, '/docs/nested/a.md'), [0, 0, 0])
  assert.equal(findTreePathInTree(tree, '/missing'), null)
})

test('getParentDirectoryPath keeps the original separator style', () => {
  assert.equal(getParentDirectoryPath('C:\\docs\\a.md'), 'C:\\docs')
  assert.equal(getParentDirectoryPath('/docs/a.md'), '/docs')
})

test('getPathBaseName extracts the trailing file or directory name', () => {
  assert.equal(getPathBaseName('C:\\docs\\a.md'), 'a.md')
  assert.equal(getPathBaseName('/docs/archive'), 'archive')
})

test('validateMoveDestination blocks moving a folder into itself or a descendant', () => {
  const source = { name: 'docs', path: 'C:\\docs', type: 'dir' as const }
  assert.equal(validateMoveDestination(source, 'C:\\docs'), 'same')
  assert.equal(validateMoveDestination(source, 'C:\\docs\\nested'), 'descendant')
  assert.equal(validateMoveDestination(source, 'C:\\archive'), null)
  assert.equal(validateMoveDestination({ name: 'a.md', path: 'C:\\docs\\a.md', type: 'file' }, 'C:\\docs'), null)
})
