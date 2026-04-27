import { formatPrimaryShortcut } from './platform.ts'

export const KEYBOARD_SHORTCUTS_OPEN_EVENT = 'app:keyboard-shortcuts-open'

export function getKeyboardShortcutsShortcutLabel(): string {
  return formatPrimaryShortcut('/')
}

export function dispatchKeyboardShortcutsOpen(): boolean {
  if (typeof document === 'undefined') return false

  return document.dispatchEvent(new CustomEvent(KEYBOARD_SHORTCUTS_OPEN_EVENT))
}
