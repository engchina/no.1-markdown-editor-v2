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

test('wysiwyg blockquotes render quote structure on the source line while keeping active syntax editable', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
  ])

  assert.match(
    source,
    /const blockquoteLineClass = onLine[\s\S]*?'cm-wysiwyg-blockquote-line cm-wysiwyg-blockquote-line-active'[\s\S]*?: 'cm-wysiwyg-blockquote-line'/u,
  )
  assert.match(
    source,
    /Decoration\.line\(\{[\s\S]*attributes: \{[\s\S]*class: blockquoteLineClass,[\s\S]*style: `--cm-wysiwyg-blockquote-depth: \$\{blockquoteLine\.depth\};`,[\s\S]*\}[\s\S]*\}\)/u,
  )
  assert.match(source, /Decoration\.mark\(\{ class: 'cm-wysiwyg-blockquote' \}\)/u)
  assert.doesNotMatch(source, /BlockquoteSpacerWidget/u)
  assert.match(
    source,
    /const BLOCKQUOTE_RULE_BACKGROUND =[\s\S]*const ACTIVE_BLOCKQUOTE_RULE_BACKGROUND =[\s\S]*const BLOCKQUOTE_LINE_PADDING_LEFT =[\s\S]*const BLOCKQUOTE_LINE_BACKGROUND_SIZE =/u,
  )
  assert.match(source, /const PROSE_BLOCK_INSET = 'var\(--md-block-shell-inset, 32px\)'/u)
  assert.match(
    source,
    /'\.cm-wysiwyg-blockquote-line': \{[\s\S]*?minHeight: '1\.45em'[\s\S]*?paddingLeft: `\$\{BLOCKQUOTE_LINE_PADDING_LEFT\} !important`[\s\S]*?paddingRight: `calc\(\$\{PROSE_BLOCK_INSET\} \+ var\(--md-quote-pad-inline-end\)\) !important`[\s\S]*?backgroundImage: BLOCKQUOTE_RULE_BACKGROUND[\s\S]*?backgroundPosition: `\$\{PROSE_BLOCK_INSET\} 0`[\s\S]*?backgroundSize: BLOCKQUOTE_LINE_BACKGROUND_SIZE/u,
  )
  assert.match(
    source,
    /'\.cm-wysiwyg-blockquote-line-active': \{[\s\S]*?backgroundImage: ACTIVE_BLOCKQUOTE_RULE_BACKGROUND/u,
  )
  assert.match(
    css,
    /:root\s*\{[\s\S]*--md-quote-pad-inline-start:\s*1\.1em;[\s\S]*--md-quote-line-width:\s*4px;[\s\S]*--md-quote-rule-color:\s*color-mix\(in srgb, var\(--text-muted\) 42%, transparent\);/u,
  )
})

test('preview and standalone blockquotes keep nested quote lines compact like the WYSIWYG surface', async () => {
  const [css, standalone] = await Promise.all([
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/markdownShared.ts', import.meta.url), 'utf8'),
  ])

  assert.match(
    css,
    /\.markdown-preview blockquote\s*\{[\s\S]*padding:\s*0 var\(--md-quote-pad-inline-end\) 0 var\(--md-quote-pad-inline-start\);/u,
  )
  assert.match(css, /\.markdown-preview blockquote>blockquote\s*\{[\s\S]*margin-top:\s*0;/u)
  assert.match(
    standalone,
    /blockquote\s*\{[\s\S]*padding:\s*0 var\(--md-quote-pad-inline-end\) 0 var\(--md-quote-pad-inline-start\);/u,
  )
  assert.match(standalone, /blockquote > blockquote \{ margin-top: 0; \}/u)
})
