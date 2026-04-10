import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getEditorRedoShortcutLabel,
  getEditorUndoShortcutLabel,
  matchesEditorRedoShortcut,
  matchesEditorUndoShortcut,
  type EditorHistoryShortcutKeyboardEventLike,
} from '../src/lib/editorHistory.ts'

function createShortcutEvent(
  overrides: Partial<EditorHistoryShortcutKeyboardEventLike>
): EditorHistoryShortcutKeyboardEventLike {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    key: '',
    isComposing: false,
    ...overrides,
  }
}

test('undo follows the platform primary modifier only', () => {
  assert.equal(matchesEditorUndoShortcut(createShortcutEvent({ ctrlKey: true, key: 'z' }), false), true)
  assert.equal(matchesEditorUndoShortcut(createShortcutEvent({ metaKey: true, key: 'z' }), false), false)
  assert.equal(matchesEditorUndoShortcut(createShortcutEvent({ metaKey: true, key: 'z' }), true), true)
  assert.equal(matchesEditorUndoShortcut(createShortcutEvent({ ctrlKey: true, key: 'z' }), true), false)
})

test('redo matches Typora-style desktop accelerators on each platform', () => {
  assert.equal(matchesEditorRedoShortcut(createShortcutEvent({ ctrlKey: true, key: 'y' }), false), true)
  assert.equal(matchesEditorRedoShortcut(createShortcutEvent({ ctrlKey: true, shiftKey: true, key: 'z' }), false), true)
  assert.equal(matchesEditorRedoShortcut(createShortcutEvent({ metaKey: true, shiftKey: true, key: 'z' }), true), true)
  assert.equal(matchesEditorRedoShortcut(createShortcutEvent({ metaKey: true, key: 'y' }), true), false)
})

test('history shortcut labels stay platform-correct', () => {
  assert.equal(getEditorUndoShortcutLabel(false), 'Ctrl+Z')
  assert.equal(getEditorRedoShortcutLabel(false), 'Ctrl+Y')
  assert.equal(getEditorUndoShortcutLabel(true), '⌘Z')
  assert.equal(getEditorRedoShortcutLabel(true), '⌘⇧Z')
})
