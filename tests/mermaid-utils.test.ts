import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canUseMermaidCommonLogosIconPack,
  detectMermaidDiagramType,
  extractMermaidLogosIconNames,
  getMermaidErrorMessage,
  getMermaidRenderErrorMessage,
  getRenderableMermaidSource,
} from '../src/lib/mermaid.ts'

test('getMermaidErrorMessage prefers error details when available', () => {
  assert.equal(
    getMermaidErrorMessage(new Error('Parse failure near line 2'), 'Diagram could not be rendered'),
    'Diagram could not be rendered: Parse failure near line 2'
  )
})

test('getMermaidErrorMessage falls back to generic label for unknown errors', () => {
  assert.equal(getMermaidErrorMessage(null, 'Diagram could not be rendered'), 'Diagram could not be rendered')
  assert.equal(getMermaidErrorMessage('Diagram could not be rendered', 'Diagram could not be rendered'), 'Diagram could not be rendered')
})

test('detectMermaidDiagramType ignores directives and comments before the diagram header', () => {
  const source = `
    %%{init: {"theme": "neutral"}}%%
    %% architecture sample
    architecture-beta
      service api(server)[API]
  `

  assert.equal(detectMermaidDiagramType(source), 'architecture')
})

test('detectMermaidDiagramType recognizes parser-backed diagram types that use the parser shim', () => {
  assert.equal(detectMermaidDiagramType('wardley-beta\n title Value chain'), 'wardley')
  assert.equal(detectMermaidDiagramType('gitGraph\n commit id: "1"'), 'gitGraph')
  assert.equal(detectMermaidDiagramType('packet\n 0-15: "Version"'), 'packet')
  assert.equal(detectMermaidDiagramType('pie title Pets adopted'), 'pie')
  assert.equal(detectMermaidDiagramType('radar-beta\n axis Speed'), 'radar')
  assert.equal(detectMermaidDiagramType('treemap-beta\n "Section 1"'), 'treemap')
  assert.equal(detectMermaidDiagramType('treeView-beta\n root'), 'treeView')
  assert.equal(detectMermaidDiagramType('info\n showInfo'), 'info')
})

test('detectMermaidDiagramType recognizes external Mermaid diagram plugins that need runtime registration', () => {
  assert.equal(detectMermaidDiagramType('zenuml\n title Demo'), 'zenuml')
})

test('detectMermaidDiagramType returns null for Mermaid diagrams without specialized warming needs', () => {
  assert.equal(detectMermaidDiagramType('flowchart LR\n A --> B'), null)
})

test('extractMermaidLogosIconNames returns unique logos pack icon names from Mermaid source', () => {
  const source = [
    'architecture-beta',
    'service api(logos:aws)[API]',
    'service worker(logos:nodejs-icon)[Worker]',
    'service cache(logos:redis)[Cache]',
    'service again(logos:aws)[Same]',
  ].join('\n')

  assert.deepEqual(extractMermaidLogosIconNames(source), ['aws', 'nodejs-icon', 'redis'])
})

test('canUseMermaidCommonLogosIconPack only accepts diagrams whose logos stay inside the curated subset', () => {
  assert.equal(
    canUseMermaidCommonLogosIconPack('architecture-beta\nservice api(logos:aws)[API]\nservice cache(logos:redis)[Cache]'),
    true
  )
  assert.equal(
    canUseMermaidCommonLogosIconPack('architecture-beta\nservice unknown(logos:100tb)[Cold path]'),
    false
  )
  assert.equal(canUseMermaidCommonLogosIconPack('flowchart LR\nA --> B'), false)
})

test('getRenderableMermaidSource removes official Mermaid placeholder lines copied into the source', () => {
  const source = [
    'radar-beta',
    'axis A, B, C, D, E',
    'curve c1{1,2,3,4,5}',
    'curve c2{5,4,3,2,1}',
    '... More Fields ...',
    '...',
    'ticks 5',
  ].join('\n')

  assert.equal(
    getRenderableMermaidSource(source),
    [
      'radar-beta',
      'axis A, B, C, D, E',
      'curve c1{1,2,3,4,5}',
      'curve c2{5,4,3,2,1}',
      'ticks 5',
    ].join('\n')
  )
})

test('getRenderableMermaidSource preserves ellipsis inside real Mermaid content lines', () => {
  const source = 'flowchart LR\nA["... More Fields ..."] --> B'
  assert.equal(getRenderableMermaidSource(source), source)
})

test('getMermaidRenderErrorMessage replaces packet syntax template lexer noise with an actionable hint', () => {
  const source = [
    'packet',
    'start: "Block name" %% Single-bit block',
    'start-end: "Block name" %% Multi-bit blocks',
    '... More Fields ...',
  ].join('\n')

  assert.equal(
    getMermaidRenderErrorMessage(
      new Error('Parsing failed: lexer noise'),
      'Diagram could not be rendered',
      source,
      'Packet diagrams require numeric bit positions such as 0-15: "Field" or +8: "Field".'
    ),
    'Diagram could not be rendered: Packet diagrams require numeric bit positions such as 0-15: "Field" or +8: "Field".'
  )
})
