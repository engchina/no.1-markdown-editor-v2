import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAIContextPacket, extractCurrentBlock, extractFrontMatter, resolveHeadingPath } from '../src/lib/ai/context.ts'
import { buildAIRequestMessages, normalizeAIDraftText } from '../src/lib/ai/prompt.ts'

const complexMarkdown = [
  '---',
  'title: Complex AI Flow',
  'tags: [markdown, ai]',
  '---',
  '',
  '# Overview',
  '',
  'See [docs](https://example.com/docs) for details.',
  '',
  '| Column | Value |',
  '| --- | --- |',
  '| Foo | Bar |',
  '',
  '```mermaid',
  'flowchart TD',
  'A-->B',
  '```',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '```ts',
  'console.log("hello")',
  '```',
].join('\n')

test('extractFrontMatter preserves the full YAML block in complex markdown documents', () => {
  assert.equal(
    extractFrontMatter(complexMarkdown),
    ['---', 'title: Complex AI Flow', 'tags: [markdown, ai]', '---'].join('\n')
  )
})

test('resolveHeadingPath keeps the active heading stable across tables, mermaid, math, and code fences', () => {
  assert.deepEqual(resolveHeadingPath(complexMarkdown, complexMarkdown.indexOf('| Foo | Bar |')), ['Overview'])
  assert.deepEqual(resolveHeadingPath(complexMarkdown, complexMarkdown.indexOf('flowchart TD')), ['Overview'])
  assert.deepEqual(resolveHeadingPath(complexMarkdown, complexMarkdown.indexOf('E = mc^2')), ['Overview'])
  assert.deepEqual(resolveHeadingPath(complexMarkdown, complexMarkdown.indexOf('console.log')), ['Overview'])
})

test('extractCurrentBlock preserves markdown structures for tables, mermaid, math, and fenced code', () => {
  assert.match(extractCurrentBlock(complexMarkdown, complexMarkdown.indexOf('| Foo | Bar |')), /\| Column \| Value \|/u)
  assert.match(extractCurrentBlock(complexMarkdown, complexMarkdown.indexOf('flowchart TD')), /```mermaid/u)
  assert.match(extractCurrentBlock(complexMarkdown, complexMarkdown.indexOf('E = mc\^2')), /\$\$/u)
  assert.match(extractCurrentBlock(complexMarkdown, complexMarkdown.indexOf('console.log')), /```ts/u)
})

test('buildAIContextPacket preserves selected markdown structures verbatim', () => {
  const selectedText = [
    '```mermaid',
    'flowchart TD',
    'A-->B',
    '```',
  ].join('\n')
  const from = complexMarkdown.indexOf(selectedText)
  const to = from + selectedText.length

  const packet = buildAIContextPacket({
    tabId: 'complex-1',
    tabPath: 'notes/complex.md',
    content: complexMarkdown,
    intent: 'edit',
    outputTarget: 'replace-selection',
    selection: { from, to },
  })

  assert.equal(packet.selectedText, selectedText)
  assert.match(packet.frontMatter ?? '', /title: Complex AI Flow/u)
  assert.deepEqual(packet.headingPath, ['Overview'])
})

test('buildAIRequestMessages explicitly instructs the model to preserve links, tables, fenced code, mermaid, math, and front matter', () => {
  const packet = buildAIContextPacket({
    tabId: 'complex-1',
    tabPath: 'notes/complex.md',
    content: complexMarkdown,
    intent: 'edit',
    outputTarget: 'replace-selection',
    selection: {
      from: complexMarkdown.indexOf('See [docs]'),
      to: complexMarkdown.indexOf('See [docs]') + 'See [docs](https://example.com/docs) for details.'.length,
    },
  })

  const messages = buildAIRequestMessages({
    prompt: 'Rewrite the selected content in a concise tone.',
    context: packet,
  })

  assert.match(messages[0].content, /links, tables, headings, fenced code blocks, Mermaid blocks, math, and front matter safe/u)
})

test('normalizeAIDraftText never strips mermaid or code fences from intended markdown content', () => {
  const mermaid = ['```mermaid', 'flowchart TD', 'A-->B', '```'].join('\n')
  const code = ['```ts', 'console.log("hello")', '```'].join('\n')

  assert.equal(normalizeAIDraftText(mermaid, 'replace-selection'), mermaid)
  assert.equal(normalizeAIDraftText(code, 'replace-selection'), code)
})

test('normalizeAIDraftText repairs invalid ATX heading spacing without mutating fenced markdown structures', () => {
  const draft = [
    '##Overview',
    '',
    '| Column | Value |',
    '| --- | --- |',
    '| Foo | Bar |',
    '',
    '```mermaid',
    '##InsideMermaid',
    'flowchart TD',
    'A-->B',
    '```',
    '',
    '###FollowUp',
  ].join('\n')

  assert.equal(
    normalizeAIDraftText(draft, 'replace-selection'),
    [
      '## Overview',
      '',
      '| Column | Value |',
      '| --- | --- |',
      '| Foo | Bar |',
      '',
      '```mermaid',
      '##InsideMermaid',
      'flowchart TD',
      'A-->B',
      '```',
      '',
      '### FollowUp',
    ].join('\n')
  )
})
