import { isMacPlatform } from './platform.ts'

export const EDITOR_HISTORY_EVENT = 'editor:history'

export type EditorHistoryAction = 'undo' | 'redo'

export interface EditorHistoryDetail {
  action: EditorHistoryAction
}

export interface EditorHistoryShortcutKeyboardEventLike {
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  key: string
  isComposing?: boolean
}

function hasPrimaryHistoryModifier(
  event: EditorHistoryShortcutKeyboardEventLike,
  mac: boolean
): boolean {
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

export function dispatchEditorHistory(action: EditorHistoryAction): boolean {
  if (typeof document === 'undefined') return false

  document.dispatchEvent(
    new CustomEvent<EditorHistoryDetail>(EDITOR_HISTORY_EVENT, {
      detail: { action },
    })
  )
  return true
}

export function matchesEditorUndoShortcut(
  event: EditorHistoryShortcutKeyboardEventLike,
  mac = isMacPlatform()
): boolean {
  if (event.isComposing || event.altKey || event.shiftKey) return false
  if (!hasPrimaryHistoryModifier(event, mac)) return false

  return event.key.toLowerCase() === 'z'
}

export function matchesEditorRedoShortcut(
  event: EditorHistoryShortcutKeyboardEventLike,
  mac = isMacPlatform()
): boolean {
  if (event.isComposing || event.altKey) return false
  if (!hasPrimaryHistoryModifier(event, mac)) return false

  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey
  if (key === 'y') return !mac && !event.shiftKey
  return false
}

export function getEditorUndoShortcutLabel(mac = isMacPlatform()): string {
  return mac ? '⌘Z' : 'Ctrl+Z'
}

export function getEditorRedoShortcutLabel(mac = isMacPlatform()): string {
  return mac ? '⌘⇧Z' : 'Ctrl+Y'
}

export function isTextInputLikeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  const editable = target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')
  if (!(editable instanceof Element)) return false

  if (editable instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(editable.type)
  }

  return true
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])
