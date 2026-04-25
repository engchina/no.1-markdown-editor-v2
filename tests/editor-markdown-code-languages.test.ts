import assert from 'node:assert/strict'
import test from 'node:test'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { resolveMarkdownCodeLanguage } from '../src/components/Editor/markdownCodeLanguages.ts'

test('resolveMarkdownCodeLanguage maps common fenced code aliases to lightweight descriptions', async () => {
  const typescript = resolveMarkdownCodeLanguage('ts title="Demo"')
  const shell = resolveMarkdownCodeLanguage('bash')

  assert.equal(typescript?.name, 'TypeScript')
  assert.equal(shell?.name, 'Shell')
  assert.ok(await typescript?.load())
  assert.ok(await shell?.load())
})

test('resolveMarkdownCodeLanguage keeps mermaid-family fences on the plain-text path', async () => {
  const mermaid = resolveMarkdownCodeLanguage('mermaid')
  const zenuml = resolveMarkdownCodeLanguage('zenuml')

  assert.equal(mermaid?.name, 'Plain Text')
  assert.equal(zenuml?.name, 'Plain Text')
  assert.ok(await mermaid?.load())
  assert.ok(await zenuml?.load())
})

test('resolveMarkdownCodeLanguage plain-text fences can be parsed without stalling the stream parser', () => {
  assert.doesNotThrow(() => {
    const state = EditorState.create({
      doc: '```mermaid\nflowchart TD\nA-->B\n```\n\n```text\nplain text\n```\n',
      extensions: [
        markdown({
          base: markdownLanguage,
          codeLanguages: resolveMarkdownCodeLanguage,
        }),
      ],
    })

    const tree = ensureSyntaxTree(state, state.doc.length, 1_000)
    assert.ok(tree)
    assert.equal(tree?.length, state.doc.length)
  })
})

test('resolveMarkdownCodeLanguage falls back to language-data only for uncommon or unknown fences', async () => {
  const nginx = resolveMarkdownCodeLanguage('nginx')
  const unknown = resolveMarkdownCodeLanguage('totally-unknown-language')

  assert.equal(nginx?.name, 'nginx')
  assert.equal(unknown?.name, 'totally-unknown-language')
  assert.ok(await nginx?.load())
  assert.ok(await unknown?.load())
})

test('resolveMarkdownCodeLanguage ignores empty info strings', () => {
  assert.equal(resolveMarkdownCodeLanguage(''), null)
  assert.equal(resolveMarkdownCodeLanguage('   '), null)
})
