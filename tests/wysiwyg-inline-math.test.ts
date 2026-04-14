import assert from 'node:assert/strict'
import test from 'node:test'
import { findInlineMathRanges } from '../src/components/Editor/wysiwygInlineMath.ts'

test('findInlineMathRanges finds bare inline math expressions for WYSIWYG rendering', () => {
  assert.deepEqual(
    findInlineMathRanges('Inline $E=mc^2$ example'),
    [
      {
        from: 7,
        to: 15,
        latex: 'E=mc^2',
        editAnchor: 8,
      },
    ]
  )
})

test('findInlineMathRanges skips inline math markers that are wrapped by inline code spans', () => {
  assert.deepEqual(findInlineMathRanges('Use `$E=mc^2$` literally'), [])
  assert.deepEqual(findInlineMathRanges('Use ``$E=mc^2$`` literally'), [])
})
