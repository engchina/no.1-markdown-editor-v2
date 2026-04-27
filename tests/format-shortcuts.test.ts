import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  getFormatActionFromShortcut,
  getFormatShortcutLabel,
  type ShortcutKeyboardEventLike,
} from '../src/components/Editor/formatShortcuts.ts'

function createShortcutEvent(overrides: Partial<ShortcutKeyboardEventLike>): ShortcutKeyboardEventLike {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    code: '',
    isComposing: false,
    ...overrides,
  }
}

test('Ctrl+U maps to underline', () => {
  const action = getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, code: 'KeyU' }))

  assert.equal(action, 'underline')
})

test('Ctrl+Shift+U maps to unordered list without stealing underline', () => {
  const action = getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'KeyU' }))

  assert.equal(action, 'ul')
})

test('Cmd+U maps to underline on macOS', () => {
  const action = getFormatActionFromShortcut(createShortcutEvent({ metaKey: true, code: 'KeyU' }), true)

  assert.equal(action, 'underline')
})

test('format shortcuts only accept the platform primary modifier', () => {
  assert.equal(getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, code: 'KeyB' }), false), 'bold')
  assert.equal(getFormatActionFromShortcut(createShortcutEvent({ metaKey: true, code: 'KeyB' }), false), null)
  assert.equal(getFormatActionFromShortcut(createShortcutEvent({ metaKey: true, code: 'KeyB' }), true), 'bold')
  assert.equal(getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, code: 'KeyB' }), true), null)
})

test('Ctrl+Shift+5 maps to strikethrough', () => {
  const action = getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'Digit5' }))

  assert.equal(action, 'strikethrough')
})

test('old Ctrl+Shift+S strikethrough binding no longer matches', () => {
  const action = getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'KeyS' }))

  assert.equal(action, null)
})

test('Markdown insertion shortcuts map to their formatting actions', () => {
  assert.equal(getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'KeyH' })), 'heading')
  assert.equal(getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'KeyO' })), 'ol')
  assert.equal(getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'KeyC' })), 'task')
  assert.equal(getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'KeyK' })), 'codeblock')
  assert.equal(getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'KeyL' })), 'link')
  assert.equal(getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'KeyG' })), 'image')
})

test('shortcut labels expose the updated strikethrough accelerator', () => {
  assert.equal(getFormatShortcutLabel('underline'), 'Ctrl+U')
  assert.equal(getFormatShortcutLabel('strikethrough'), 'Ctrl+Shift+5')
  assert.equal(getFormatShortcutLabel('heading'), 'Ctrl+Shift+H')
  assert.equal(getFormatShortcutLabel('codeblock'), 'Ctrl+Shift+K')
  assert.equal(getFormatShortcutLabel('link'), 'Ctrl+Shift+L')
  assert.equal(getFormatShortcutLabel('image'), 'Ctrl+Shift+G')
})

test('shortcut labels stay platform-correct on macOS', () => {
  assert.equal(getFormatShortcutLabel('bold', true), '⌘B')
  assert.equal(getFormatShortcutLabel('heading', true), '⌘⇧H')
  assert.equal(getFormatShortcutLabel('codeblock', true), '⌘⇧K')
})

test('command palette uses the shared Markdown shortcut registry for insert commands', async () => {
  const [commands, palette] = await Promise.all([
    readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(commands, /id: 'edit\.heading'[\s\S]*shortcut: getFormatShortcutLabel\('heading'\)/)
  assert.match(commands, /id: 'edit\.codeBlock'[\s\S]*shortcut: getFormatShortcutLabel\('codeblock'\)/)
  assert.match(commands, /id: 'edit\.ul'[\s\S]*shortcut: getFormatShortcutLabel\('ul'\)/)
  assert.match(commands, /id: 'edit\.ol'[\s\S]*shortcut: getFormatShortcutLabel\('ol'\)/)
  assert.match(commands, /id: 'edit\.task'[\s\S]*shortcut: getFormatShortcutLabel\('task'\)/)
  assert.match(commands, /id: 'edit\.link'[\s\S]*shortcut: getFormatShortcutLabel\('link'\)/)
  assert.match(commands, /id: 'edit\.image'[\s\S]*shortcut: getFormatShortcutLabel\('image'\)/)
  assert.match(palette, /\['edit\.heading', 125]/)
  assert.match(palette, /case 'edit\.heading':\s+return <TextBadge label="H" \/>/)
})
