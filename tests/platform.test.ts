import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatPrimaryShortcut,
  hasPrimaryModifier,
  matchesPrimaryShortcut,
  type PrimaryModifierEvent,
} from '../src/lib/platform.ts'

function createPrimaryModifierEvent(overrides: Partial<PrimaryModifierEvent>): PrimaryModifierEvent {
  return {
    ctrlKey: false,
    metaKey: false,
    ...overrides,
  }
}

function createShortcutEvent(
  overrides: Partial<Parameters<typeof matchesPrimaryShortcut>[0]>
): Parameters<typeof matchesPrimaryShortcut>[0] {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    code: '',
    key: '',
    isComposing: false,
    ...overrides,
  }
}

test('primary modifier is Ctrl on Windows and Linux and Cmd on macOS', () => {
  assert.equal(hasPrimaryModifier(createPrimaryModifierEvent({ ctrlKey: true }), false), true)
  assert.equal(hasPrimaryModifier(createPrimaryModifierEvent({ metaKey: true }), false), false)
  assert.equal(hasPrimaryModifier(createPrimaryModifierEvent({ ctrlKey: true, metaKey: true }), false), false)

  assert.equal(hasPrimaryModifier(createPrimaryModifierEvent({ metaKey: true }), true), true)
  assert.equal(hasPrimaryModifier(createPrimaryModifierEvent({ ctrlKey: true }), true), false)
  assert.equal(hasPrimaryModifier(createPrimaryModifierEvent({ ctrlKey: true, metaKey: true }), true), false)
})

test('primary shortcut matching rejects the non-platform modifier', () => {
  assert.equal(matchesPrimaryShortcut(createShortcutEvent({ ctrlKey: true, key: 'b' }), { key: 'b' }, false), true)
  assert.equal(matchesPrimaryShortcut(createShortcutEvent({ metaKey: true, key: 'b' }), { key: 'b' }, false), false)

  assert.equal(matchesPrimaryShortcut(createShortcutEvent({ metaKey: true, key: 'b' }), { key: 'b' }, true), true)
  assert.equal(matchesPrimaryShortcut(createShortcutEvent({ ctrlKey: true, key: 'b' }), { key: 'b' }, true), false)
})

test('primary shortcut labels include Alt in platform-native order', () => {
  assert.equal(formatPrimaryShortcut('G', { alt: true }, false), 'Ctrl+Alt+G')
  assert.equal(formatPrimaryShortcut('G', { alt: true }, true), '⌘⌥G')
})
