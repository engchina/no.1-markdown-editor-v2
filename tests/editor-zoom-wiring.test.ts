import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('view commands reserve the primary zoom shortcuts for app zoom and leave font size as palette-only actions', async () => {
  const commands = await readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8')

  assert.match(commands, /id: 'view\.zoomIn'/)
  assert.match(commands, /id: 'view\.zoomIn'[\s\S]*shortcut: increaseFontShortcut/)
  assert.match(commands, /id: 'view\.zoomOut'[\s\S]*shortcut: decreaseFontShortcut/)
  assert.match(commands, /id: 'view\.zoomReset'[\s\S]*shortcut: resetFontShortcut/)
  assert.match(commands, /id: 'view\.fontSizeIncrease'[\s\S]*action: \(\) => store\.setFontSize\(Math\.min\(store\.fontSize \+ 1, 24\)\)/)
  assert.match(commands, /id: 'view\.fontSizeDecrease'[\s\S]*action: \(\) => store\.setFontSize\(Math\.max\(store\.fontSize - 1, 11\)\)/)
  assert.match(commands, /id: 'view\.fontSizeReset'[\s\S]*action: \(\) => store\.setFontSize\(14\)/)
  assert.doesNotMatch(
    commands,
    /id: 'view\.fontSizeIncrease',[\s\S]*?shortcut:[\s\S]*?action: \(\) => store\.setFontSize\(Math\.min\(store\.fontSize \+ 1, 24\)\)/
  )
  assert.doesNotMatch(
    commands,
    /id: 'view\.fontSizeDecrease',[\s\S]*?shortcut:[\s\S]*?action: \(\) => store\.setFontSize\(Math\.max\(store\.fontSize - 1, 11\)\)/
  )
  assert.doesNotMatch(commands, /id: 'view\.fontSizeReset',[\s\S]*?shortcut:[\s\S]*?action: \(\) => store\.setFontSize\(14\)/)
})

test('command palette prioritizes and badges zoom commands ahead of font size commands', async () => {
  const palette = await readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8')

  assert.match(palette, /\['view\.zoomIn', 226]/)
  assert.match(palette, /\['view\.zoomOut', 227]/)
  assert.match(palette, /\['view\.zoomReset', 228]/)
  assert.match(palette, /\['view\.fontSizeIncrease', 229]/)
  assert.match(palette, /\['view\.fontSizeDecrease', 230]/)
  assert.match(palette, /\['view\.fontSizeReset', 231]/)
  assert.match(palette, /case 'view\.zoomIn':\s+return <TextBadge label="Z\+" \/>/)
  assert.match(palette, /case 'view\.zoomOut':\s+return <TextBadge label="Z-" \/>/)
  assert.match(palette, /case 'view\.zoomReset':\s+return <TextBadge label="Z" \/>/)
  assert.match(palette, /case 'view\.fontSizeIncrease':\s+return <TextBadge label="A\+" \/>/)
  assert.match(palette, /case 'view\.fontSizeDecrease':\s+return <TextBadge label="A-" \/>/)
  assert.match(palette, /case 'view\.fontSizeReset':\s+return <TextBadge label="A" \/>/)
})
