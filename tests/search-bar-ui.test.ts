import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('search bar exposes labeled fields and grouped editor controls', async () => {
  const source = await readFile(new URL('../src/components/Search/SearchBar.tsx', import.meta.url), 'utf8')

  assert.match(source, /<label className="search-bar__label" htmlFor=\{findInputId\}/)
  assert.match(source, /<input[\s\S]*id=\{findInputId\}[\s\S]*className="search-bar__input"/)
  assert.match(source, /<label className="search-bar__label" htmlFor=\{replaceInputId\}/)
  assert.match(source, /<input[\s\S]*id=\{replaceInputId\}[\s\S]*className="search-bar__input"/)
  assert.match(source, /className="search-bar__toggle-group"/)
  assert.match(source, /className="search-bar__button-group"/)
  assert.match(source, /aria-pressed=\{caseSensitive\}/)
  assert.match(source, /aria-pressed=\{wholeWord\}/)
  assert.match(source, /aria-pressed=\{useRegex\}/)
  assert.match(source, /<AppIcon name="arrowUp" size=\{15\} \/>/)
  assert.match(source, /<AppIcon name="arrowDown" size=\{15\} \/>/)
})

test('search bar styles define compact focus, disabled, and responsive states', async () => {
  const css = await readFile(new URL('../src/global.css', import.meta.url), 'utf8')

  assert.match(css, /\.search-bar\s*\{[\s\S]*grid-template-columns: 66px minmax\(180px, 1fr\) auto/)
  assert.match(css, /\.search-bar__field:focus-within\s*\{[\s\S]*box-shadow:/)
  assert.match(css, /\.search-bar\s*\{[\s\S]*container-type: inline-size/)
  assert.match(css, /\.search-bar__toggle\[aria-pressed='true'\]\s*\{[\s\S]*var\(--accent\)/)
  assert.match(css, /\.search-bar__text-button--primary\s*\{[\s\S]*var\(--accent-hover\)/)
  assert.match(css, /\.search-bar__text-button--primary:disabled\s*\{[\s\S]*box-shadow: none/)
  assert.match(css, /@container \(max-width: 760px\)\s*\{[\s\S]*\.search-bar__row\s*\{[\s\S]*grid-template-columns: 1fr/)
  assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*\.search-bar__row\s*\{[\s\S]*grid-template-columns: 1fr/)
})

test('shared app icons include find navigation arrows used by the search bar', async () => {
  const icons = await readFile(new URL('../src/components/Icons/AppIcon.tsx', import.meta.url), 'utf8')

  assert.match(icons, /\| 'arrowUp'/)
  assert.match(icons, /\| 'arrowDown'/)
  assert.match(icons, /arrowUp: 'M12 19V5 M5 12l7-7 7 7'/)
  assert.match(icons, /arrowDown: 'M12 5v14 M5 12l7 7 7-7'/)
})
