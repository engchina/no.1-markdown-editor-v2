import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReferenceAwareMarkdownSource,
  collectReferenceDefinitionMarkdown,
} from '../src/components/Editor/wysiwygReferenceLinks.ts'

test('collectReferenceDefinitionMarkdown canonicalizes nested reference definitions for inline reuse', () => {
  const markdown = [
    'Paragraph with [quoted][id] and [logo][brand].',
    '',
    '> [id]: http://example.com/',
    '>   "Optional',
    '>   Title"',
    '',
    '- [brand]: https://example.com/logo.png',
  ].join('\n')

  assert.equal(
    collectReferenceDefinitionMarkdown(markdown),
    [
      '[id]: http://example.com/ "Optional Title"',
      '[brand]: https://example.com/logo.png',
    ].join('\n')
  )
})

test('buildReferenceAwareMarkdownSource appends canonical reference definitions after the fragment', () => {
  const source = buildReferenceAwareMarkdownSource(
    '[an example][id]',
    '[id]: http://example.com/ "Optional Title Here"'
  )

  assert.equal(
    source,
    [
      '[an example][id]',
      '',
      '[id]: http://example.com/ "Optional Title Here"',
    ].join('\n')
  )
})
