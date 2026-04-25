import assert from 'node:assert/strict'
import test from 'node:test'
import { collectInlineMediaRanges } from '../src/components/Editor/wysiwygInlineMedia.ts'

test('collectInlineMediaRanges keeps plain markdown links on the lightweight inline-link path', () => {
  assert.deepEqual(collectInlineMediaRanges('[link](https://example.com)'), {
    renderedFragments: [],
    links: [
      {
        from: 0,
        to: 27,
        contentFrom: 1,
        contentTo: 5,
      },
    ],
  })
})

test('collectInlineMediaRanges keeps GFM autolink literals on the lightweight inline-link path', () => {
  assert.deepEqual(collectInlineMediaRanges('Contact i@typora.io or www.google.com'), {
    renderedFragments: [],
    links: [
      {
        from: 8,
        to: 19,
        contentFrom: 8,
        contentTo: 19,
      },
      {
        from: 23,
        to: 37,
        contentFrom: 23,
        contentTo: 37,
      },
    ],
  })
})

test('collectInlineMediaRanges hides angle-bracket autolink syntax while preserving linked content', () => {
  assert.deepEqual(collectInlineMediaRanges('For example <i@typora.io> and <https://example.com>'), {
    renderedFragments: [],
    links: [
      {
        from: 12,
        to: 25,
        contentFrom: 13,
        contentTo: 24,
      },
      {
        from: 30,
        to: 51,
        contentFrom: 31,
        contentTo: 50,
      },
    ],
  })
})

test('collectInlineMediaRanges resolves reference-style links when definitions are provided', () => {
  assert.deepEqual(
    collectInlineMediaRanges('[an example][id]', {
      referenceDefinitionsMarkdown: '[id]: http://example.com/ "Optional Title Here"',
    }),
    {
      renderedFragments: [],
      links: [
        {
          from: 0,
          to: 16,
          contentFrom: 1,
          contentTo: 11,
        },
      ],
    }
  )
})

test('collectInlineMediaRanges promotes standalone markdown images into rendered fragments', () => {
  assert.deepEqual(collectInlineMediaRanges('![img](https://example.com/cat.png)'), {
    renderedFragments: [
      {
        from: 0,
        to: 35,
        kind: 'image',
      },
    ],
    links: [],
  })
})

test('collectInlineMediaRanges promotes reference-style images into rendered fragments', () => {
  assert.deepEqual(
    collectInlineMediaRanges('![img][logo]', {
      referenceDefinitionsMarkdown: '[logo]: https://example.com/cat.png',
    }),
    {
      renderedFragments: [
        {
          from: 0,
          to: 12,
          kind: 'image',
        },
      ],
      links: [],
    }
  )
})

test('collectInlineMediaRanges promotes linked markdown images into rendered fragments', () => {
  assert.deepEqual(collectInlineMediaRanges('[![img](https://example.com/cat.png)](https://example.com)'), {
    renderedFragments: [
      {
        from: 0,
        to: 58,
        kind: 'linked-media',
      },
    ],
    links: [],
  })
})

test('collectInlineMediaRanges promotes links whose label mixes an image and text into rendered fragments', () => {
  assert.deepEqual(
    collectInlineMediaRanges('[![img](https://example.com/logo.png)日本オラクル株式会社](https://qiita.com/organizations/oracle)'),
    {
      renderedFragments: [
        {
          from: 0,
          to: 88,
          kind: 'linked-media',
        },
      ],
      links: [],
    }
  )
})

test('collectInlineMediaRanges promotes reference-style linked media into rendered fragments', () => {
  assert.deepEqual(
    collectInlineMediaRanges('[![img][logo]Oracle][org]', {
      referenceDefinitionsMarkdown: [
        '[logo]: https://example.com/logo.png',
        '[org]: https://example.com/org',
      ].join('\n'),
    }),
    {
      renderedFragments: [
        {
          from: 0,
          to: 25,
          kind: 'linked-media',
        },
      ],
      links: [],
    }
  )
})

test('collectInlineMediaRanges keeps inline code image syntax literal', () => {
  assert.deepEqual(collectInlineMediaRanges('`![img](https://example.com/cat.png)`'), {
    renderedFragments: [],
    links: [],
  })
})
