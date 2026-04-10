import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAIRequestMessages, normalizeAIDraftText } from '../src/lib/ai/prompt.ts'
import type { AIContextPacket } from '../src/lib/ai/types.ts'

const baseContext: AIContextPacket = {
  tabId: 'tab-1',
  tabPath: 'notes/demo.md',
  fileName: 'demo.md',
  documentLanguage: 'en',
  intent: 'edit',
  scope: 'selection',
  outputTarget: 'replace-selection',
  selectedText: 'Hello world',
  selectedTextRole: 'transform-target',
  beforeText: 'Before context',
  afterText: 'After context',
  currentBlock: 'Hello world',
  headingPath: ['Intro'],
  frontMatter: '---\ntitle: Demo\n---',
}

test('buildAIRequestMessages creates system and user messages with visible context sections', () => {
  const messages = buildAIRequestMessages({
    prompt: 'Rewrite this in a concise tone.',
    context: baseContext,
  })

  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  assert.match(messages[0].content, /Markdown editor/u)
  assert.match(messages[0].content, /standards-compliant Markdown/u)
  assert.match(messages[0].content, /ATX headings/u)
  assert.match(messages[1].content, /Rewrite this in a concise tone\./u)
  assert.match(messages[1].content, /Selected text/u)
  assert.match(messages[1].content, /Heading path/u)
})

test('buildAIRequestMessages uses standalone-note guidance for new-note targets', () => {
  const messages = buildAIRequestMessages({
    prompt: 'Create a knowledge note from this section.',
    context: {
      ...baseContext,
      intent: 'generate',
      scope: 'current-block',
      outputTarget: 'new-note',
    },
  })

  assert.match(messages[0].content, /self-contained new note/u)
  assert.match(messages[1].content, /Output target: new-note/u)
})

test('buildAIRequestMessages appends explicit attached context sections after the visible local context', () => {
  const messages = buildAIRequestMessages({
    prompt: 'Compare the selected text against the attached references.',
    context: {
      ...baseContext,
      explicitContextAttachments: [
        {
          id: 'note:1',
          kind: 'note',
          label: 'project-plan.md',
          detail: 'notes/project-plan.md',
          content: '# Plan\n\nMilestone: ship AI mentions.',
          query: 'project plan',
        },
        {
          id: 'search:1',
          kind: 'search',
          label: 'Milestone',
          detail: '1 hit across 1 note',
          content: 'Workspace search for "Milestone":\n\n- project-plan.md:3\n  Milestone: ship AI mentions.',
          query: 'Milestone',
        },
      ],
    },
  })

  assert.match(messages[0].content, /Use only the explicit attached note, heading, and search context/u)
  assert.match(messages[1].content, /Attached note/u)
  assert.match(messages[1].content, /Attached workspace search/u)
})

test('normalizeAIDraftText removes surrounding markdown fences for insertion targets', () => {
  const normalized = normalizeAIDraftText('```markdown\n# Hello\n```', 'replace-selection')
  assert.equal(normalized, '# Hello')
})

test('normalizeAIDraftText normalizes missing spaces in ATX headings for document insertion targets', () => {
  const normalized = normalizeAIDraftText(['##123', '', '###标题', '', '####Heading'].join('\n'), 'replace-selection')
  assert.equal(normalized, ['## 123', '', '### 标题', '', '#### Heading'].join('\n'))
})

test('normalizeAIDraftText preserves non-markdown fenced blocks such as code and mermaid', () => {
  const codeBlock = '```\nconsole.log("hello")\n```'
  const mermaidBlock = '```mermaid\nflowchart TD\nA-->B\n```'

  assert.equal(normalizeAIDraftText(codeBlock, 'replace-selection'), codeBlock)
  assert.equal(normalizeAIDraftText(mermaidBlock, 'replace-selection'), mermaidBlock)
})

test('normalizeAIDraftText does not rewrite heading-like lines inside fenced blocks', () => {
  const draft = [
    '##123',
    '',
    '```md',
    '##456',
    '###InsideFence',
    '```',
    '',
    '###OutsideFence',
  ].join('\n')

  assert.equal(
    normalizeAIDraftText(draft, 'replace-selection'),
    [
      '## 123',
      '',
      '```md',
      '##456',
      '###InsideFence',
      '```',
      '',
      '### OutsideFence',
    ].join('\n')
  )
})

test('normalizeAIDraftText preserves bare fenced blocks instead of assuming they are markdown wrappers', () => {
  const bareFence = '```\n# This might be an intended fenced block\n```'
  assert.equal(normalizeAIDraftText(bareFence, 'replace-selection'), bareFence)
})

test('normalizeAIDraftText keeps chat-only replies intact apart from trimming', () => {
  const normalized = normalizeAIDraftText('  Here is the answer.  ', 'chat-only')
  assert.equal(normalized, 'Here is the answer.')
})
