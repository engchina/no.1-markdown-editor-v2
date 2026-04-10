import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attachAIPromptMentionContext,
  parseAIPromptMentions,
  resolveAIPromptMentions,
} from '../src/lib/ai/mentions.ts'
import {
  buildAIContextPacket,
  detectAIDocumentLanguage,
  extractCurrentBlock,
  extractFrontMatter,
  resolveCurrentHeadingRange,
  resolveHeadingPath,
} from '../src/lib/ai/context.ts'
import type { AIApplySnapshot, AIContextPacket } from '../src/lib/ai/types.ts'

const sampleDocument = [
  '---',
  'title: Demo',
  'tags: [ai, markdown]',
  '---',
  '',
  '# Intro',
  '',
  'First paragraph line.',
  'Second paragraph line.',
  '',
  '## Details',
  '',
  'Target sentence for editing.',
  'Another line.',
].join('\n')

test('detectAIDocumentLanguage recognizes english, chinese, japanese, and mixed content', () => {
  assert.equal(detectAIDocumentLanguage('Hello world'), 'en')
  assert.equal(detectAIDocumentLanguage('这是一个测试'), 'zh')
  assert.equal(detectAIDocumentLanguage('これはテストです'), 'ja')
  assert.equal(detectAIDocumentLanguage('Hello 世界'), 'mixed')
})

test('extractFrontMatter returns the opening YAML block only', () => {
  assert.equal(extractFrontMatter(sampleDocument), ['---', 'title: Demo', 'tags: [ai, markdown]', '---'].join('\n'))
})

test('resolveHeadingPath returns the heading trail at the target offset', () => {
  const offset = sampleDocument.indexOf('Target sentence')
  assert.deepEqual(resolveHeadingPath(sampleDocument, offset), ['Intro', 'Details'])
})

test('resolveCurrentHeadingRange spans the active heading section until the next peer heading', () => {
  const content = [
    '# Intro',
    '',
    'First paragraph line.',
    '',
    '## Details',
    '',
    'Target sentence for editing.',
    '',
    '### Deep Dive',
    '',
    'Nested detail line.',
    '',
    '## Next Heading',
    '',
    'Another section.',
  ].join('\n')

  const range = resolveCurrentHeadingRange(content, content.indexOf('Nested detail line.'))
  assert.ok(range)
  assert.equal(
    content.slice(range!.from, range!.to).trim(),
    ['### Deep Dive', '', 'Nested detail line.'].join('\n')
  )
})

test('extractCurrentBlock returns the block surrounding the anchor offset', () => {
  const offset = sampleDocument.indexOf('Second paragraph')
  assert.equal(
    extractCurrentBlock(sampleDocument, offset),
    ['First paragraph line.', 'Second paragraph line.'].join('\n')
  )
})

test('buildAIContextPacket captures selection, heading path, front matter, and nearby context', () => {
  const selectedText = 'Target sentence for editing.'
  const from = sampleDocument.indexOf(selectedText)
  const to = from + selectedText.length

  const packet = buildAIContextPacket({
    tabId: 'tab-1',
    tabPath: 'notes/demo.md',
    content: sampleDocument,
    intent: 'edit',
    outputTarget: 'replace-selection',
    selection: { from, to },
  })

  assert.equal(packet.fileName, 'demo.md')
  assert.equal(packet.scope, 'selection')
  assert.equal(packet.selectedText, selectedText)
  assert.equal(packet.selectedTextRole, 'transform-target')
  assert.deepEqual(packet.headingPath, ['Intro', 'Details'])
  assert.match(packet.frontMatter ?? '', /title: Demo/u)
  assert.match(packet.beforeText ?? '', /First paragraph line|## Details/u)
  assert.match(packet.afterText ?? '', /Another line\./u)
})

test('parseAIPromptMentions strips explicit context directives from the user instruction', () => {
  const parsed = parseAIPromptMentions(
    'Compare this with @note(project plan) and inspect @heading(Deep Dive).\nAlso use @search(Milestone).'
  )

  assert.equal(parsed.cleanPrompt, 'Compare this with and inspect.\nAlso use.')
  assert.deepEqual(
    parsed.mentions.map((mention) => ({ kind: mention.kind, query: mention.query })),
    [
      { kind: 'note', query: 'project plan' },
      { kind: 'heading', query: 'Deep Dive' },
      { kind: 'search', query: 'Milestone' },
    ]
  )
})

test('resolveAIPromptMentions attaches current note, matching heading, and search hits explicitly', async () => {
  const currentDocument = [
    '# Intro',
    '',
    'Opening paragraph.',
    '',
    '## Deep Dive',
    '',
    'Important implementation details live here.',
    '',
    '# Outro',
    '',
    'Wrap-up.',
  ].join('\n')

  const snapshot: AIApplySnapshot = {
    tabId: 'tab-current',
    selectionFrom: 0,
    selectionTo: 0,
    anchorOffset: currentDocument.indexOf('Opening paragraph.'),
    blockFrom: 0,
    blockTo: currentDocument.indexOf('# Outro'),
    docText: currentDocument,
  }

  const baseContext: AIContextPacket = {
    tabId: 'tab-current',
    tabPath: 'notes/current.md',
    fileName: 'current.md',
    documentLanguage: 'en',
    intent: 'ask',
    scope: 'current-block',
    outputTarget: 'chat-only',
    currentBlock: 'Opening paragraph.',
    headingPath: ['Intro'],
  }

  const parsed = parseAIPromptMentions('Compare @note with @heading(Deep Dive) and @search(Milestone).')
  const resolutions = await resolveAIPromptMentions({
    mentions: parsed.mentions,
    baseContext,
    sourceSnapshot: snapshot,
    tabs: [
      {
        id: 'tab-current',
        name: 'current.md',
        path: 'notes/current.md',
        content: currentDocument,
      },
      {
        id: 'tab-plan',
        name: 'project-plan.md',
        path: 'notes/project-plan.md',
        content: '# Plan\n\nMilestone: ship explicit AI mentions.',
      },
    ],
    rootPath: null,
  })

  assert.equal(resolutions.length, 3)
  assert.equal(resolutions.every((resolution) => resolution.status === 'resolved'), true)

  const attachedContext = attachAIPromptMentionContext(baseContext, resolutions)
  assert.equal(attachedContext?.explicitContextAttachments?.length, 3)
  assert.deepEqual(
    attachedContext?.explicitContextAttachments?.map((attachment) => attachment.kind),
    ['note', 'heading', 'search']
  )
  assert.match(attachedContext?.explicitContextAttachments?.[0].content ?? '', /Opening paragraph/u)
  assert.match(attachedContext?.explicitContextAttachments?.[1].label ?? '', /Intro > Deep Dive/u)
  assert.match(attachedContext?.explicitContextAttachments?.[2].content ?? '', /Milestone: ship explicit AI mentions\./u)
})

test('resolveAIPromptMentions surfaces unresolved mention problems explicitly', async () => {
  const parsed = parseAIPromptMentions('Use @heading(Unknown) and @search().')
  const resolutions = await resolveAIPromptMentions({
    mentions: parsed.mentions,
    baseContext: null,
    sourceSnapshot: null,
    tabs: [],
    rootPath: null,
  })

  assert.deepEqual(
    resolutions.map((resolution) => resolution.errorCode),
    ['heading-not-found', 'search-empty-query']
  )
})
