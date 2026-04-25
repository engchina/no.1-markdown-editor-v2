import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('wysiwyg gutter hides secondary source lines for inactive block renderers', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/global.css', import.meta.url), 'utf8')

  assert.match(source, /class HiddenGutterMarker extends GutterMarker/u)
  assert.match(source, /class ReservedHiddenGutterMarker extends GutterMarker/u)
  assert.match(source, /elementClass = 'cm-wysiwyg-gutter-hidden'/u)
  assert.match(source, /elementClass = 'cm-wysiwyg-gutter-hidden-reserved'/u)
  assert.match(source, /function buildWysiwygGutterClasses\(state: CodeMirrorState\): RangeSet<GutterMarker> \{/u)
  assert.match(source, /const fencedCodeBlocks = collectFencedCodeBlocks\(markdown\)/u)
  assert.match(source, /const mathBlocks = collectMathBlocks\(markdown, fencedCodeBlocks\)/u)
  assert.match(source, /const tables = collectMarkdownTableBlocks\(markdown, \[\.\.\.fencedCodeBlocks, \.\.\.mathBlocks\]\)/u)
  assert.match(source, /const markers = new Map<number, GutterMarker>\(\)/u)
  assert.match(source, /const nonTextBlockRanges = \[[\s\S]*?fencedCodeBlocks\.map\(\(\{ from, to \}\) => \(\{ from, to \}\)\)[\s\S]*?mathBlocks\.map\(\(\{ from, to \}\) => \(\{ from, to \}\)\)[\s\S]*?tables\.map\(\(\{ from, to \}\) => \(\{ from, to \}\)\)[\s\S]*?sort\(\(left, right\) => left\.from - right\.from\)/u)
  assert.match(source, /for \(const fence of fencedCodeBlocks\) \{[\s\S]*?markers\.set\(doc\.lineAt\(closingFrom\)\.from, reservedHiddenGutterMarker\)/u)
  assert.match(source, /for \(const mathBlock of mathBlocks\) \{[\s\S]*?if \(!markers\.has\(hiddenLine\.from\)\) markers\.set\(hiddenLine\.from, hiddenGutterMarker\)/u)
  assert.match(source, /for \(const table of tables\) \{[\s\S]*?if \(!markers\.has\(hiddenLine\.from\)\) markers\.set\(hiddenLine\.from, hiddenGutterMarker\)/u)
  assert.match(source, /for \(let lineNumber = 1; lineNumber <= doc\.lines; lineNumber \+= 1\) \{[\s\S]*?isThematicBreakLine\(line\.text\)[\s\S]*?stateSelectionTouchesRange\(state, line\.from, line\.to\)[\s\S]*?if \(!markers\.has\(line\.from\)\) markers\.set\(line\.from, hiddenGutterMarker\)/u)
  assert.match(source, /if \(markers\.size === 0\) return RangeSet\.empty/u)
  assert.match(source, /const sorted = \[\.\.\.markers\.entries\(\)\]\.sort\(\(\[left\], \[right\]\) => left - right\)/u)
  assert.match(source, /for \(const \[pos, marker\] of sorted\) \{[\s\S]*?builder\.add\(pos, pos, marker\)/u)
  assert.match(source, /const wysiwygGutterClassField = StateField\.define<RangeSet<GutterMarker>>\(/u)
  assert.match(source, /provide: \(field\) => gutterLineClass\.from\(field\)/u)
  assert.match(source, /export const wysiwygTableDecorations = \[wysiwygTableDecorationField, wysiwygGutterClassField\]/u)

  assert.match(css, /\.cm-gutterElement\.cm-wysiwyg-gutter-hidden\s*\{[\s\S]*height:\s*0\s*!important;[\s\S]*padding:\s*0\s*!important;[\s\S]*pointer-events:\s*none;/u)
  assert.match(css, /\.cm-gutterElement\.cm-wysiwyg-gutter-hidden-reserved\s*\{[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/u)
})
