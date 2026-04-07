import assert from 'node:assert/strict'
import test from 'node:test'
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

test('Cmd+U maps to underline on macOS', () => {
  const action = getFormatActionFromShortcut(createShortcutEvent({ metaKey: true, code: 'KeyU' }))

  assert.equal(action, 'underline')
})

test('Ctrl+Shift+5 maps to strikethrough', () => {
  const action = getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'Digit5' }))

  assert.equal(action, 'strikethrough')
})

test('old Ctrl+Shift+S strikethrough binding no longer matches', () => {
  const action = getFormatActionFromShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, code: 'KeyS' }))

  assert.equal(action, null)
})

test('shortcut labels expose the updated strikethrough accelerator', () => {
  assert.equal(getFormatShortcutLabel('underline'), 'Ctrl+U')
  assert.equal(getFormatShortcutLabel('strikethrough'), 'Ctrl+Shift+5')
})
