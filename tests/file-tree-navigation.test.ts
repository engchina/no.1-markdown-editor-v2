import assert from 'node:assert/strict'
import test from 'node:test'
import {
  flattenVisibleFileTree,
  getAdjacentVisibleTreePath,
  getFirstChildVisibleTreePath,
  getParentVisibleTreePath,
} from '../src/lib/fileTreeNavigation.ts'
import type { FileNode } from '../src/store/fileTree.ts'

const tree: FileNode[] = [
  {
    name: 'docs',
    path: '/docs',
    type: 'dir',
    expanded: true,
    children: [
      {
        name: 'notes.md',
        path: '/docs/notes.md',
        type: 'file',
      },
      {
        name: 'archive',
        path: '/docs/archive',
        type: 'dir',
        expanded: true,
        children: [
          {
            name: 'old.md',
            path: '/docs/archive/old.md',
            type: 'file',
          },
        ],
      },
    ],
  },
]

test('flattenVisibleFileTree preserves visible order with depth and parents', () => {
  assert.deepEqual(flattenVisibleFileTree(tree), [
    { path: '/docs', type: 'dir', expanded: true, depth: 0, parentPath: null },
    { path: '/docs/notes.md', type: 'file', expanded: undefined, depth: 1, parentPath: '/docs' },
    { path: '/docs/archive', type: 'dir', expanded: true, depth: 1, parentPath: '/docs' },
    { path: '/docs/archive/old.md', type: 'file', expanded: undefined, depth: 2, parentPath: '/docs/archive' },
  ])
})

test('file tree navigation helpers move between siblings, children, and parents', () => {
  const visible = flattenVisibleFileTree(tree)
  assert.equal(getAdjacentVisibleTreePath(visible, '/docs/notes.md', 1), '/docs/archive')
  assert.equal(getAdjacentVisibleTreePath(visible, '/docs/notes.md', -1), '/docs')
  assert.equal(getFirstChildVisibleTreePath(visible, '/docs'), '/docs/notes.md')
  assert.equal(getParentVisibleTreePath(visible, '/docs/archive/old.md'), '/docs/archive')
})
