import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('preview and wysiwyg share the same prose typography tokens', async () => {
  const [css, source] = await Promise.all([
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8'),
  ])

  assert.match(css, /--font-preview:\s*'Inter', system-ui, sans-serif;/u)
  assert.match(css, /--md-prose-line-height:\s*1\.8;/u)
  assert.match(css, /--md-heading-line-height:\s*1\.3;/u)
  assert.match(css, /--md-block-shell-inset:\s*32px;/u)
  assert.match(css, /--md-code-block-radius:\s*10px;/u)
  assert.match(css, /--md-list-bullet-disc-size:\s*0\.33em;/u)
  assert.match(css, /--md-list-bullet-circle-size:\s*0\.33em;/u)
  assert.match(css, /--md-list-bullet-square-size:\s*0\.27em;/u)
  assert.match(css, /--md-list-bullet-circle-stroke:\s*1px;/u)
  assert.match(css, /--md-list-marker-gap:\s*0\.9em;/u)
  assert.match(css, /--md-list-ordered-marker-gap:\s*0\.55em;/u)
  assert.match(css, /--md-list-marker-offset-y:\s*0em;/u)
  assert.match(css, /\.markdown-preview\s*\{[\s\S]*font-family:\s*var\(--font-preview, Inter, system-ui, sans-serif\);/u)
  assert.match(css, /\.markdown-preview\s*\{[\s\S]*line-height:\s*var\(--md-prose-line-height, 1\.8\);/u)
  assert.match(css, /\.markdown-preview h1,\s*\.markdown-preview h2,\s*\.markdown-preview h3,\s*\.markdown-preview h4,\s*\.markdown-preview h5,\s*\.markdown-preview h6\s*\{[\s\S]*line-height:\s*var\(--md-heading-line-height, 1\.3\);/u)
  assert.match(css, /\.markdown-preview h4\s*\{[\s\S]*font-size:\s*var\(--md-heading-4-size, 1\.1em\);/u)
  assert.match(css, /\.markdown-preview h6\s*\{[\s\S]*font-size:\s*var\(--md-heading-6-size, 0\.95em\);/u)
  assert.match(css, /\.markdown-preview pre\s*\{[\s\S]*border-radius:\s*var\(--md-code-block-radius, 10px\);[\s\S]*padding:\s*var\(--md-code-block-padding-block, 16px\) var\(--md-code-block-padding-inline, 16px\);/u)

  assert.match(source, /const PREVIEW_FONT_FAMILY = 'var\(--font-preview, Inter, system-ui, sans-serif\)'/u)
  assert.match(source, /const PROSE_LINE_HEIGHT = 'var\(--md-prose-line-height, 1\.8\)'/u)
  assert.match(source, /const HEADING_LINE_HEIGHT = 'var\(--md-heading-line-height, 1\.3\)'/u)
  assert.match(source, /const PROSE_BLOCK_INSET = 'var\(--md-block-shell-inset, 32px\)'/u)
  assert.match(source, /const CODE_BLOCK_RADIUS = 'var\(--md-code-block-radius, 10px\)'/u)
  assert.match(source, /const LIST_MARKER_DISC_SIZE = 'var\(--md-list-bullet-disc-size, 0\.33em\)'/u)
  assert.match(source, /const LIST_MARKER_CIRCLE_SIZE = 'var\(--md-list-bullet-circle-size, 0\.33em\)'/u)
  assert.match(source, /const LIST_MARKER_SQUARE_SIZE = 'var\(--md-list-bullet-square-size, 0\.27em\)'/u)
  assert.match(source, /const LIST_MARKER_CIRCLE_STROKE = 'var\(--md-list-bullet-circle-stroke, 1px\)'/u)
  assert.match(source, /const LIST_MARKER_GAP = 'var\(--md-list-marker-gap, 0\.9em\)'/u)
  assert.match(source, /const LIST_ORDERED_MARKER_GAP = 'var\(--md-list-ordered-marker-gap, 0\.55em\)'/u)
  assert.match(source, /const LIST_MARKER_OFFSET_Y = 'var\(--md-list-marker-offset-y, 0em\)'/u)
  assert.match(source, /'\.cm-content': \{[\s\S]*fontFamily: PREVIEW_FONT_FAMILY[\s\S]*lineHeight: PROSE_LINE_HEIGHT/u)
  assert.match(source, /'\.cm-wysiwyg-h2': \{[\s\S]*fontSize: 'var\(--md-heading-2-size, 1\.5em\)'[\s\S]*lineHeight: HEADING_LINE_HEIGHT[\s\S]*fontFamily: PREVIEW_FONT_FAMILY/u)
  assert.match(source, /'\.cm-wysiwyg-h6': \{[\s\S]*fontSize: 'var\(--md-heading-6-size, 0\.95em\)'[\s\S]*lineHeight: HEADING_LINE_HEIGHT[\s\S]*color: 'var\(--text-primary\) !important'[\s\S]*fontFamily: PREVIEW_FONT_FAMILY/u)
  assert.match(source, /'\.cm-wysiwyg-codeblock-meta-line': \{[\s\S]*borderTopLeftRadius: CODE_BLOCK_RADIUS[\s\S]*borderTopRightRadius: CODE_BLOCK_RADIUS/u)
})

test('preview and wysiwyg share the same inline markdown presentation tokens', async () => {
  const [css, source] = await Promise.all([
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8'),
  ])

  assert.match(css, /--md-inline-script-font-size:\s*0\.75em;/u)
  assert.match(css, /--md-inline-code-padding:\s*0\.125em 0\.375em;/u)
  assert.match(css, /\.markdown-preview a\s*\{[\s\S]*text-decoration:\s*var\(--md-link-text-decoration, none\);/u)
  assert.match(css, /\.markdown-preview a:hover\s*\{[\s\S]*text-decoration:\s*var\(--md-link-hover-text-decoration, underline\);/u)
  assert.match(css, /\.markdown-preview del\s*\{[\s\S]*var\(--md-strikethrough-color/u)
  assert.match(css, /\.markdown-preview sub\s*\{[\s\S]*font-size:\s*var\(--md-inline-script-font-size, 0\.75em\);[\s\S]*line-height:\s*var\(--md-inline-script-line-height, 0\);/u)
  assert.match(css, /\.markdown-preview code\s*\{[\s\S]*padding:\s*var\(--md-inline-code-padding, 0\.125em 0\.375em\);[\s\S]*border-radius:\s*var\(--md-inline-code-radius, 4px\);[\s\S]*font-family:\s*var\(--font-mono, JetBrains Mono, Cascadia Code, Fira Code, Consolas, monospace\);/u)
  assert.match(css, /--md-list-indent:\s*1\.75em;/u)
  assert.match(css, /\.markdown-preview ul,\s*\.markdown-preview ol\s*\{[\s\S]*padding-left:\s*var\(--md-list-indent, 1\.75em\);/u)
  assert.match(css, /\.markdown-preview li \+ li\s*\{[\s\S]*margin-top:\s*var\(--md-list-item-space, 0\.2em\);/u)
  assert.match(css, /\.markdown-preview li::marker\s*\{[\s\S]*font-weight:\s*var\(--md-list-marker-font-weight, 400\);/u)
  assert.match(css, /\.cm-wysiwyg-footnote-ref\s*\{[\s\S]*font-size:\s*var\(--md-inline-script-font-size, 0\.75em\);[\s\S]*text-decoration:\s*var\(--md-link-text-decoration, none\);/u)

  assert.match(source, /const MONO_FONT_FAMILY = 'var\(--font-mono, JetBrains Mono, Cascadia Code, Fira Code, Consolas, monospace\)'/u)
  assert.match(source, /const LIST_MARKER_INLINE_SIZE = 'var\(--md-list-marker-inline-size, 1ch\)'/u)
  assert.match(source, /const LIST_MARKER_FONT_WEIGHT = 'var\(--md-list-marker-font-weight, 400\)'/u)
  assert.match(source, /'\.cm-wysiwyg-strikethrough': \{[\s\S]*var\(--md-strikethrough-color/u)
  assert.match(source, /'\.cm-wysiwyg-subscript': \{[\s\S]*fontSize: 'var\(--md-inline-script-font-size, 0\.75em\)'[\s\S]*lineHeight: 'var\(--md-inline-script-line-height, 0\)'/u)
  assert.match(source, /'\.cm-wysiwyg-code': \{[\s\S]*fontFamily: MONO_FONT_FAMILY[\s\S]*fontSize: 'var\(--md-inline-code-font-size, 0\.875em\)'[\s\S]*padding: 'var\(--md-inline-code-padding, 0\.125em 0\.375em\)'/u)
  assert.match(source, /'\.cm-wysiwyg-link': \{[\s\S]*textDecoration: 'var\(--md-link-text-decoration, none\)'/u)
  assert.match(source, /'\.cm-wysiwyg-link:hover': \{[\s\S]*textDecoration: 'var\(--md-link-hover-text-decoration, underline\)'/u)
  assert.match(source, /'\.cm-wysiwyg-inline-fragment a': \{[\s\S]*textDecoration: 'var\(--md-link-text-decoration, none\)'/u)
  assert.match(source, /'\.cm-wysiwyg-inline-fragment:hover a': \{[\s\S]*textDecoration: 'var\(--md-link-hover-text-decoration, underline\)'/u)
  assert.match(source, /const LIST_INDENT = 'var\(--md-list-indent, 1\.75em\)'/u)
  assert.match(source, /'\.cm-wysiwyg-bullet-simple': \{[\s\S]*width: LIST_MARKER_INLINE_SIZE[\s\S]*fontWeight: LIST_MARKER_FONT_WEIGHT/u)
  assert.match(source, /'\.cm-wysiwyg-ordered-number': \{[\s\S]*fontWeight: LIST_MARKER_FONT_WEIGHT/u)
})
