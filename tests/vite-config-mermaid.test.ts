import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const viteConfigSource = readFileSync(resolve('vite.config.ts'), 'utf8')
const mermaidParserSource = readFileSync(resolve('src/lib/mermaidParser.ts'), 'utf8')
const mermaidSource = readFileSync(resolve('src/lib/mermaid.ts'), 'utf8')

test('vite keeps Mermaid on the shim while exposing the upstream parser package for prebundling', () => {
  assert.match(viteConfigSource, /find:\s*\/\^@mermaid-js\\\/parser\$\//u)
  assert.match(viteConfigSource, /find:\s*\/\^@mermaid-js\\\/parser-upstream\$\//u)
  assert.match(viteConfigSource, /include:\s*\['mermaid', '@mermaid-js\/parser-upstream', 'langium'\]/u)
  assert.match(viteConfigSource, /OPTIONAL_PREVIEW_CHUNK_PATTERN[\s\S]*zenuml/u)
})

test('the Mermaid parser shim imports the upstream package through the dedicated alias', () => {
  assert.match(mermaidParserSource, /import\('@mermaid-js\/parser-upstream'\)/u)
  assert.match(mermaidParserSource, /const nodeMermaidParserSpecifier = '@mermaid-js\/parser'/u)
  assert.match(mermaidParserSource, /import\(nodeMermaidParserSpecifier\)/u)
  assert.doesNotMatch(mermaidParserSource, /import\('\.\.\/\.\.\/node_modules\/@mermaid-js\/parser/u)
})

test('treemap parser leaves stay on the Mermaid parser chunk and are exposed by the shim', () => {
  assert.match(viteConfigSource, /const isMermaidParserLeafModule =[\s\S]*treemap/u)
  assert.match(mermaidParserSource, /createTreemapServices/u)
  assert.match(mermaidParserSource, /treemap:\s*\{\s*create:\s*'createTreemapServices',\s*service:\s*'Treemap'/u)
})

test('Mermaid loads the logos icon pack through an on-demand JSON asset instead of bundling the whole JS module', () => {
  assert.match(mermaidSource, /import\('@iconify-json\/logos\/icons\.json\?url'\)/u)
  assert.match(mermaidSource, /import\('\.\/mermaidLogosCommon\.json\?url'\)/u)
  assert.match(mermaidSource, /const response = await fetch\(iconSetUrl\)/u)
  assert.doesNotMatch(mermaidSource, /import\('@iconify-json\/logos'\)\s*\.then/u)
  assert.match(viteConfigSource, /normalizedId\.includes\('\/node_modules\/@iconify-json\/logos\/'\)/u)
  assert.match(viteConfigSource, /return 'vendor-mermaid-icons'/u)
  assert.match(mermaidSource, /mermaid\.registerIconPacks\(\[\s*\{\s*name: 'logos',\s*icons,/u)
  assert.match(mermaidSource, /activeMermaidLogosIconPackKey/u)
  assert.match(mermaidSource, /COMMON_MERMAID_LOGOS_ICON_NAMES/u)
  assert.match(mermaidSource, /canUseMermaidCommonLogosIconPack/u)
})

test('Mermaid keeps ZenUML outside the eager warm path and dev optimizer defaults', () => {
  assert.match(
    mermaidSource,
    /zenuml:\s*async \(\) => \{[\s\S]*ensureMermaidExternalDiagramRegistered\(mermaid, 'zenuml'\)/u
  )
  assert.doesNotMatch(
    mermaidSource,
    /zenuml:\s*async \(\) => \{[\s\S]*ensureMermaidExternalDiagramRegistered\(mermaid, 'zenuml', true\)/u
  )
  assert.match(mermaidSource, /registerExternalDiagrams\(\[zenuml\], \{ lazyLoad: !eagerLoad \}\)/u)
  assert.doesNotMatch(viteConfigSource, /@mermaid-js\/mermaid-zenuml/u)
  assert.doesNotMatch(viteConfigSource, /@zenuml\/core/u)
})

test('Mermaid keeps langium and chevrotain in the same parser runtime chunk to avoid circular chunk graphs', () => {
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/langium\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/chevrotain\/'\)[\s\S]*return 'vendor-mermaid-parser-runtime'/u
  )
  assert.doesNotMatch(viteConfigSource, /return 'vendor-mermaid-parser-langium'/u)
  assert.doesNotMatch(viteConfigSource, /return 'vendor-mermaid-parser-chevrotain'/u)
})

test('build warnings stay actionable by exempting only the known cold ZenUML definition chunk', () => {
  assert.match(viteConfigSource, /const ACTIONABLE_CHUNK_SIZE_WARNING_LIMIT_KB = 560/u)
  assert.match(viteConfigSource, /const KNOWN_OPTIONAL_LARGE_CHUNK_PATTERN = \/\^assets\\\/zenuml-definition-/u)
  assert.match(viteConfigSource, /name: 'report-actionable-large-chunks'/u)
  assert.match(viteConfigSource, /chunkSizeWarningLimit: 4000/u)
  assert.match(
    viteConfigSource,
    /if \(KNOWN_OPTIONAL_LARGE_CHUNK_PATTERN\.test\(output\.fileName\)\) continue/u
  )
  assert.match(
    viteConfigSource,
    /Actionable chunk size \$\{sizeKb\.toFixed\(1\)\} kB exceeds \$\{ACTIONABLE_CHUNK_SIZE_WARNING_LIMIT_KB\} kB/u
  )
})
