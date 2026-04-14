import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const viteConfigSource = readFileSync(resolve('vite.config.ts'), 'utf8')

test('vite keeps CodeMirror language-data and language packages out of the core editor chunk', () => {
  assert.match(viteConfigSource, /const isCodeMirrorWebLanguage =[\s\S]*@codemirror\/lang-html[\s\S]*@codemirror\/lang-vue/u)
  assert.match(viteConfigSource, /const isLezerWebLanguage =[\s\S]*@lezer\/html[\s\S]*@lezer\/javascript/u)
  assert.match(viteConfigSource, /if \(isCodeMirrorWebLanguage \|\| isLezerWebLanguage\) \{[\s\S]*return 'vendor-editor-language-web'/u)
  assert.match(
    viteConfigSource,
    /if \([\s\S]*@codemirror\/lang-[\s\S]*@codemirror\/language-data\/[\s\S]*@codemirror\/legacy-modes\/[\s\S]*return 'vendor-editor-language'/u
  )
})

test('vite manualChunks normalizes Windows paths before chunk routing', () => {
  assert.match(viteConfigSource, /const normalizedId = id\.replaceAll\('\\\\', '\/'\)/u)
  assert.match(viteConfigSource, /if \(!normalizedId\.includes\('\/node_modules\/'\)\) return/u)
})
