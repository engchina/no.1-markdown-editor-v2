import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  collectFootnoteIndices,
  findBlockFootnoteRanges,
  findInlineFootnoteRanges,
} from '../src/components/Editor/wysiwygFootnote.ts'

test('findInlineFootnoteRanges matches references while skipping code spans and block definitions', () => {
  const markdown = [
    'a[^note] `[^skip]`',
    '',
    '[^def]: body',
    'b[^two]',
  ].join('\n')

  const noteFrom = markdown.indexOf('[^note]')
  const twoFrom = markdown.indexOf('[^two]')

  assert.deepEqual(findInlineFootnoteRanges(markdown), [
    {
      from: noteFrom,
      to: noteFrom + '[^note]'.length,
      contentFrom: noteFrom + 2,
      contentTo: noteFrom + '[^note]'.length - 1,
      label: 'note',
    },
    {
      from: twoFrom,
      to: twoFrom + '[^two]'.length,
      contentFrom: twoFrom + 2,
      contentTo: twoFrom + '[^two]'.length - 1,
      label: 'two',
    },
  ])
})

test('findBlockFootnoteRanges matches indented footnote definitions', () => {
  const markdown = [
    'Intro',
    '  [^note]: first line',
    '[^other]: second line',
  ].join('\n')

  const noteFrom = markdown.indexOf('[^note]')
  const otherFrom = markdown.indexOf('[^other]')

  assert.deepEqual(findBlockFootnoteRanges(markdown), [
    {
      from: noteFrom,
      to: noteFrom + '[^note]: '.length,
      labelFrom: noteFrom + 2,
      labelTo: noteFrom + 2 + 'note'.length,
      label: 'note',
    },
    {
      from: otherFrom,
      to: otherFrom + '[^other]: '.length,
      labelFrom: otherFrom + 2,
      labelTo: otherFrom + 2 + 'other'.length,
      label: 'other',
    },
  ])
})

test('collectFootnoteIndices assigns stable display numbers from first reference order', () => {
  const markdown = 'alpha[^b] beta[^a] gamma[^b] delta[^c]'

  assert.deepEqual(
    Array.from(collectFootnoteIndices(markdown).entries()),
    [
      ['b', 1],
      ['a', 2],
      ['c', 3],
    ],
  )
})

test('wysiwyg footnote support wires hover tooltip and presentation styles into the editor', async () => {
  const [editorSource, wysiwygSource, footnoteSource, hoverSource, css] = await Promise.all([
    readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/wysiwygFootnote.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/wysiwygFootnoteHover.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
  ])

  assert.match(editorSource, /import\('\.\/wysiwygFootnoteHover'\)/u)
  assert.match(editorSource, /wysiwygFootnoteHoverTooltip/u)
  assert.match(editorSource, /const footnoteHoverCompartmentRef = useRef\(new Compartment\(\)\)/u)
  assert.match(
    editorSource,
    /setFootnoteHoverExtension\(\[wysiwygFootnoteHoverTooltip\]\)/u,
  )
  assert.match(editorSource, /footnoteHoverCompartmentRef\.current\.of\(footnoteHoverExtension\)/u)
  assert.match(editorSource, /reconfigure\(footnoteHoverCompartmentRef\.current, footnoteHoverExtension\)/u)

  assert.match(footnoteSource, /el\.dataset\.footnoteKind = 'ref'/u)
  assert.match(footnoteSource, /el\.dataset\.footnoteLabel = this\.label/u)
  assert.match(footnoteSource, /el\.dataset\.footnoteEditAnchor = String\(this\.editAnchor\)/u)
  assert.match(footnoteSource, /el\.setAttribute\('aria-keyshortcuts', 'Enter Space'\)/u)
  assert.match(footnoteSource, /el\.setAttribute\('role', 'button'\)/u)
  assert.match(footnoteSource, /el\.tabIndex = 0/u)
  assert.match(wysiwygSource, /function activateFootnoteTarget\(view: EditorView, target: EventTarget \| null\): boolean \{/u)
  assert.match(wysiwygSource, /findBlockFootnoteRanges\(view\.state\.doc\.toString\(\)\)\.find\(\(range\) => range\.label === label\)/u)
  assert.match(wysiwygSource, /closest\('\.cm-wysiwyg-footnote-ref, \.cm-wysiwyg-footnote-def'\)/u)
  assert.match(wysiwygSource, /isPlainFootnoteWidgetActivationKey\(event\)/u)
  assert.match(hoverSource, /collectReferenceDefinitionMarkdown\(stripFrontMatter\(fullText\)\.body\)/u)
  assert.match(hoverSource, /renderInlineMarkdownFragment\(footnoteContent, \{ referenceDefinitionsMarkdown \}\)/u)

  assert.match(css, /\.cm-wysiwyg-footnote-ref\s*\{/u)
  assert.match(css, /\.cm-wysiwyg-footnote-def-active\s*\{/u)
  assert.match(css, /\.cm-wysiwyg-footnote-tooltip\s*\{/u)
  assert.match(css, /\.cm-wysiwyg-footnote-ref:focus-visible,\s*\.cm-wysiwyg-footnote-def:focus-visible\s*\{/u)
})
