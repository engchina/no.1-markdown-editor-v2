import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { parseWysiwygBlockquoteLine } from '../src/components/Editor/wysiwygBlockquote.ts'

test('parseWysiwygBlockquoteLine recognizes canonical blockquote lines', () => {
  assert.deepEqual(parseWysiwygBlockquoteLine('> quoted text'), {
    prefix: '> ',
    content: 'quoted text',
    depth: 1,
    isEmpty: false,
  })
})

test('parseWysiwygBlockquoteLine keeps empty quoted continuation lines inside the blockquote', () => {
  assert.deepEqual(parseWysiwygBlockquoteLine('>'), {
    prefix: '>',
    content: '',
    depth: 1,
    isEmpty: true,
  })
})

test('parseWysiwygBlockquoteLine treats whitespace-only quoted lines as empty', () => {
  assert.deepEqual(parseWysiwygBlockquoteLine('>   '), {
    prefix: '>   ',
    content: '',
    depth: 1,
    isEmpty: true,
  })
})

test('parseWysiwygBlockquoteLine accepts compact blockquote syntax without a separating space', () => {
  assert.deepEqual(parseWysiwygBlockquoteLine('>quoted text'), {
    prefix: '>',
    content: 'quoted text',
    depth: 1,
    isEmpty: false,
  })
})

test('parseWysiwygBlockquoteLine preserves nested quote prefixes', () => {
  assert.deepEqual(parseWysiwygBlockquoteLine('> > nested quote'), {
    prefix: '> > ',
    content: 'nested quote',
    depth: 2,
    isEmpty: false,
  })
})

test('wysiwyg blockquotes keep the active line structurally visible while weakening the quote rule', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(
    source,
    /const blockquoteClass = onLine[\s\S]*?'cm-wysiwyg-blockquote cm-wysiwyg-blockquote-active'[\s\S]*?: 'cm-wysiwyg-blockquote'/u,
  )
  assert.match(source, /Decoration\.mark\(\{ class: blockquoteClass \}\)/u)
  assert.match(
    source,
    /'\.cm-wysiwyg-blockquote': \{[\s\S]*?borderLeft: '4px solid color-mix\(in srgb, var\(--text-muted\) 42%, transparent\)'[\s\S]*?paddingLeft: '14px'/u,
  )
  assert.match(
    source,
    /'\.cm-wysiwyg-blockquote-active': \{[\s\S]*?borderLeftColor: 'color-mix\(in srgb, var\(--text-muted\) 22%, transparent\)'/u,
  )
})
