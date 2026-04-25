import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const viteConfigSource = readFileSync(resolve('vite.config.ts'), 'utf8')

test('vite isolates markdown raw-html and syntax-highlighting dependencies from the base markdown chunk', () => {
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('rehype-raw'\)[\s\S]*normalizedId\.includes\('parse5'\)[\s\S]*return/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('\/node_modules\/lowlight\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/highlight\.js\/'\)[\s\S]*normalizedId\.includes\('\/node_modules\/hast-util-to-text\/'\)[\s\S]*return 'vendor-markdown-highlight'/u
  )
  assert.match(
    viteConfigSource,
    /normalizedId\.includes\('remark-math'\)[\s\S]*normalizedId\.includes\('rehype-katex'\)[\s\S]*return 'vendor-markdown-math'/u
  )
  assert.match(viteConfigSource, /OPTIONAL_PREVIEW_CHUNK_PATTERN[\s\S]*vendor-markdown\(\?:-\(\?:math\|html\)\)\?/u)
})
