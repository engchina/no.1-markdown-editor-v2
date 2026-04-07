import type { FormatAction } from './formatCommands'

export type ShortcutFormatAction = Extract<FormatAction, 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code'>

export interface ShortcutKeyboardEventLike {
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  code: string
  isComposing?: boolean
}

interface FormatShortcutDefinition {
  code: string
  requiresShift: boolean
  label: string
}

const FORMAT_SHORTCUTS: Record<ShortcutFormatAction, FormatShortcutDefinition> = {
  bold: { code: 'KeyB', requiresShift: false, label: 'Ctrl+B' },
  italic: { code: 'KeyI', requiresShift: false, label: 'Ctrl+I' },
  underline: { code: 'KeyU', requiresShift: false, label: 'Ctrl+U' },
  strikethrough: { code: 'Digit5', requiresShift: true, label: 'Ctrl+Shift+5' },
  code: { code: 'Backquote', requiresShift: false, label: 'Ctrl+`' },
}

const FORMAT_SHORTCUT_ENTRIES = Object.entries(FORMAT_SHORTCUTS) as [ShortcutFormatAction, FormatShortcutDefinition][]

export function getFormatShortcutLabel(action: ShortcutFormatAction): string {
  return FORMAT_SHORTCUTS[action].label
}

export function getFormatActionFromShortcut(event: ShortcutKeyboardEventLike): ShortcutFormatAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) {
    return null
  }

  for (const [action, shortcut] of FORMAT_SHORTCUT_ENTRIES) {
    if (event.code === shortcut.code && event.shiftKey === shortcut.requiresShift) {
      return action
    }
  }

  return null
}
