import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import { collectMathBlocks } from '../src/components/Editor/mathBlockRanges.ts'
import { collectInactiveWysiwygMathBlocks } from '../src/components/Editor/wysiwygMathBlock.ts'

function collectVisibleMathBlocks(markdown: string, anchor: number) {
  const state = EditorState.create({
    doc: markdown,
    selection: { anchor },
  })

  return collectInactiveWysiwygMathBlocks(
    {
      state,
      visibleRanges: [{ from: 0, to: markdown.length }],
    },
    collectMathBlocks(markdown)
  )
}

test('collectInactiveWysiwygMathBlocks returns display math blocks for rendering when the selection is outside', () => {
  const markdown = [
    'Before',
    '',
    '$$',
    '\\mathbf{v}_1 + \\mathbf{v}_2',
    '$$',
    '',
    'After',
  ].join('\n')

  const blocks = collectVisibleMathBlocks(markdown, 0)

  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].latex, '\\mathbf{v}_1 + \\mathbf{v}_2')
  assert.equal(blocks[0].from, markdown.indexOf('$$'))
  assert.equal(blocks[0].editAnchor, markdown.indexOf('\\mathbf'))
})

test('collectInactiveWysiwygMathBlocks drops display math rendering when the selection enters the TeX source', () => {
  const markdown = [
    'Before',
    '',
    '$$',
    '\\mathbf{v}_1 + \\mathbf{v}_2',
    '$$',
    '',
    'After',
  ].join('\n')

  const blocks = collectVisibleMathBlocks(markdown, markdown.indexOf('\\mathbf'))

  assert.deepEqual(blocks, [])
})

test('wysiwyg math block theme keeps preview-like spacing instead of a code-frame shell', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /class InlineMathWidget extends WidgetType \{[\s\S]*?private readonly editAnchor: number/u)
  assert.match(source, /el\.className = 'cm-wysiwyg-math-inline'[\s\S]*?el\.dataset\.mathEditAnchor = String\(this\.editAnchor\)/u)
  assert.match(source, /el\.setAttribute\('aria-keyshortcuts', 'Enter Space'\)/u)
  assert.match(source, /el\.tabIndex = 0/u)
  assert.match(source, /findInlineMathRanges\(text\)/u)
  assert.match(source, /new InlineMathWidget\(range\.latex, lineFrom \+ range\.editAnchor\)/u)
  assert.match(source, /el\.dataset\.mathEditAnchor = String\(this\.editAnchor\)/u)
  assert.match(source, /ignoreEvent\(\) \{ return false \}/u)
  assert.match(source, /function activateMathTarget\(view: EditorView, target: EventTarget \| null\): boolean \{[\s\S]*?closest<HTMLElement>\('\.cm-wysiwyg-math-block, \.cm-wysiwyg-math-inline'\)[\s\S]*?selection: \{ anchor: editAnchor \}/u)
  assert.match(source, /function isPlainMathWidgetActivationKey\(event: KeyboardEvent\): boolean \{/u)
  assert.match(source, /closest\('\.cm-wysiwyg-math-block, \.cm-wysiwyg-math-inline'\)[\s\S]*?isPlainMathWidgetActivationKey\(event\)[\s\S]*?activateMathTarget\(view, event\.target\)/u)
  assert.match(source, /'\.cm-wysiwyg-math-block-anchor-line': \{[\s\S]*?padding: '0 !important'/u)
  assert.match(source, /'\.cm-wysiwyg-math-block-hidden-line': \{[\s\S]*?height: '0'[\s\S]*?fontSize: '0'/u)
  assert.match(source, /'\.cm-wysiwyg-math-block': \{[\s\S]*?width: '100%'[\s\S]*?cursor: 'text'/u)
  assert.match(source, /'\.cm-wysiwyg-math-inline': \{[\s\S]*?cursor: 'text'[\s\S]*?padding: '0 0\.14em'[\s\S]*?borderRadius: '0\.34em'/u)
  assert.match(source, /'\.cm-wysiwyg-math-inline:hover': \{[\s\S]*?backgroundColor:[\s\S]*?boxShadow:/u)
  assert.match(source, /'\.cm-wysiwyg-math-inline:focus-visible': \{[\s\S]*?outline:[\s\S]*?boxShadow:/u)
  assert.match(source, /'\.cm-wysiwyg-math-block__surface': \{[\s\S]*?margin: `0\.5em \$\{PROSE_BLOCK_INSET\}`[\s\S]*?padding: `8px \$\{CODE_BLOCK_PADDING_INLINE\}`[\s\S]*?borderRadius: '12px'/u)
  assert.match(source, /'\.cm-wysiwyg-math-block:hover \.cm-wysiwyg-math-block__surface': \{[\s\S]*?backgroundColor:/u)
  assert.match(source, /'\.cm-wysiwyg-math-block:focus-visible \.cm-wysiwyg-math-block__surface': \{[\s\S]*?boxShadow:/u)
  assert.match(source, /'\.cm-wysiwyg-math-block__rendered \.katex-display': \{[\s\S]*?margin: '0'[\s\S]*?padding: '8px 0'/u)
  assert.doesNotMatch(source, /BlockMathWidget\(mathBlock\.latex\), block: true/u)
})
