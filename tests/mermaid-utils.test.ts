import assert from 'node:assert/strict'
import test from 'node:test'
import { detectMermaidDiagramType, getMermaidErrorMessage } from '../src/lib/mermaid.ts'

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

test('detectMermaidDiagramType recognizes parser-backed diagram types that benefit from targeted warming', () => {
  assert.equal(detectMermaidDiagramType('wardley-beta\n title Value chain'), 'wardley')
  assert.equal(detectMermaidDiagramType('gitGraph\n commit id: "1"'), 'gitGraph')
  assert.equal(detectMermaidDiagramType('packet-beta\n 0-15: "Version"'), 'packet')
  assert.equal(detectMermaidDiagramType('pie title Pets adopted'), 'pie')
  assert.equal(detectMermaidDiagramType('radar-beta\n axis Speed'), 'radar')
  assert.equal(detectMermaidDiagramType('treeView-beta\n root'), 'treeView')
  assert.equal(detectMermaidDiagramType('info\n showInfo'), 'info')
})

test('detectMermaidDiagramType returns null for Mermaid diagrams without specialized warming needs', () => {
  assert.equal(detectMermaidDiagramType('flowchart LR\n A --> B'), null)
})
