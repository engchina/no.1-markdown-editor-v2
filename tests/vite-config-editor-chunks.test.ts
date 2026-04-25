import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const viteConfigSource = readFileSync(resolve('vite.config.ts'), 'utf8')

test('vite keeps CodeMirror language-data and language packages out of the core editor chunk', () => {
  assert.match(viteConfigSource, /const OPTIONAL_EDITOR_CHUNK_PATTERN =[\s\S]*vendor-editor\(\?:-\[\^"\]\+\)\?/u)
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/state\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@marijn\/find-cluster-break\/'\)[\s\S]*return 'vendor-editor-state'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/view\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/crelt\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/style-mod\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/w3c-keyname\/'\)[\s\S]*return 'vendor-editor-view'/u
  )
  assert.match(viteConfigSource, /normalizedId\.includes\('\/node_modules\/@codemirror\/commands\/'\)[\s\S]*return 'vendor-editor-commands'/u)
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/language\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/common\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/highlight\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/lr\/'\)[\s\S]*return 'vendor-editor-language-core'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-markdown\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/markdown\/'\)[\s\S]*return 'vendor-editor-language-markdown'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-sql\/'\)[\s\S]*return 'vendor-editor-language-sql'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-cpp\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/cpp\/'\)[\s\S]*return 'vendor-editor-language-cpp'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-go\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/go\/'\)[\s\S]*return 'vendor-editor-language-go'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-java\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/java\/'\)[\s\S]*return 'vendor-editor-language-java'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-json\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/json\/'\)[\s\S]*return 'vendor-editor-language-json'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-php\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/php\/'\)[\s\S]*return 'vendor-editor-language-php'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-python\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/python\/'\)[\s\S]*return 'vendor-editor-language-python'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-rust\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/rust\/'\)[\s\S]*return 'vendor-editor-language-rust'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-xml\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/xml\/'\)[\s\S]*return 'vendor-editor-language-xml'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-yaml\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/yaml\/'\)[\s\S]*return 'vendor-editor-language-yaml'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-html\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/html\/'\)[\s\S]*return 'vendor-editor-language-html'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-css\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/css\/'\)[\s\S]*return 'vendor-editor-language-css'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-javascript\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@codemirror\/lint\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@lezer\/javascript\/'\)[\s\S]*return 'vendor-editor-language-javascript'/u
  )
  assert.match(viteConfigSource, /normalizedId\.includes\('\/node_modules\/@codemirror\/language-data\/'\)[\s\S]*return 'vendor-editor-language-data'/u)
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/legacy-modes\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@codemirror\/legacy-modes\/mode\/shell'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@codemirror\/legacy-modes\/mode\/diff'\)[\s\S]*return 'vendor-editor-legacy-common'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/@codemirror\/lang-angular\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/@codemirror\/lang-vue\/'\)[\s\S]*return 'vendor-editor-language-web'/u
  )
  assert.match(
    viteConfigSource,
    /if \([\s\S]*@codemirror\/lang-[\s\S]*@lezer\/markdown\/[\s\S]*@lezer\/sass\/[\s\S]*return 'vendor-editor-language'/u
  )
})

test('vite manualChunks normalizes Windows paths before chunk routing', () => {
  assert.match(viteConfigSource, /const normalizedId = id\.replaceAll\('\\\\', '\/'\)/u)
  assert.match(viteConfigSource, /if \(!normalizedId\.includes\('\/node_modules\/'\)\) return/u)
})
