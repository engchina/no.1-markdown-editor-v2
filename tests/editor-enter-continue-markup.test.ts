import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import { insertNewlineContinueMarkup, markdown } from '@codemirror/lang-markdown'

function applyContinueMarkup(doc: string, anchor = doc.length): { ok: boolean; doc: string; anchor: number } {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown()],
  })

  let nextState = state
  const view = {
    state,
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      nextState = state.update(spec).state
    },
  }

  const ok = insertNewlineContinueMarkup(view)
  return {
    ok,
    doc: nextState.doc.toString(),
    anchor: nextState.selection.main.head,
  }
}

test('markdown enter continuation keeps list, task list, and blockquote editing predictable', () => {
  assert.deepEqual(applyContinueMarkup('- item'), {
    ok: true,
    doc: '- item\n- ',
    anchor: '- item\n- '.length,
  })

  assert.deepEqual(applyContinueMarkup('- [ ] task'), {
    ok: true,
    doc: '- [ ] task\n- [ ] ',
    anchor: '- [ ] task\n- [ ] '.length,
  })

  assert.deepEqual(applyContinueMarkup('> quote'), {
    ok: true,
    doc: '> quote\n> ',
    anchor: '> quote\n> '.length,
  })

  assert.deepEqual(applyContinueMarkup('1. item'), {
    ok: true,
    doc: '1. item\n2. ',
    anchor: '1. item\n2. '.length,
  })
})

test('markdown enter continuation is still enabled in the editor language setup', async () => {
  const source = await readFile(new URL('../src/components/Editor/optionalFeatures.ts', import.meta.url), 'utf8')

  assert.match(source, /markdown\(\{\s*[\s\S]*addKeymap: true,[\s\S]*\}\)/u)
  assert.match(source, /codeLanguages: resolveMarkdownCodeLanguage/u)
  assert.doesNotMatch(source, /import\('@codemirror\/language-data'\)/u)
})
