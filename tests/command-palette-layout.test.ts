import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('command palette search uses a rounded focus shell instead of the native input outline', async () => {
  const [palette, css] = await Promise.all([
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
  ])

  assert.match(palette, /className="command-palette__search flex min-h-12 flex-1 items-center gap-3 px-3"/)
  assert.match(palette, /className="command-palette__search-input min-w-0 flex-1 bg-transparent text-sm outline-none"/)
  assert.match(palette, /aria-controls="command-palette-results"/)

  assert.match(css, /\.command-palette__search \{[\s\S]*border-radius: 12px;/)
  assert.match(css, /\.command-palette__search:focus-within \{[\s\S]*box-shadow:/)
  assert.match(css, /\.command-palette__search-input:focus-visible \{[\s\S]*outline: none;[\s\S]*box-shadow: none;/)
})

test('command palette result rows share the desktop surface badge and selected-state styling', async () => {
  const [palette, css] = await Promise.all([
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/global.css', import.meta.url), 'utf8'),
  ])

  assert.match(palette, /className="command-palette__badge flex h-7 w-7 flex-shrink-0 items-center justify-center"/)
  assert.match(palette, /className="command-palette__shortcut flex-shrink-0 px-2 py-1 text-\[11px\] font-semibold leading-none"/)
  assert.match(palette, /className="command-palette__footer flex flex-shrink-0 items-center gap-4 px-4 py-2 text-xs"/)

  assert.match(css, /\.command-palette__item \{[\s\S]*border-radius: 12px;[\s\S]*min-height: 48px;/)
  assert.match(css, /\.command-palette__item--selected \{[\s\S]*linear-gradient\(/)
  assert.match(css, /\.command-palette__item--selected \{[\s\S]*inset 2px 0 0/)
  assert.match(css, /\.command-palette__badge \{[\s\S]*border-radius: 10px;/)
})
