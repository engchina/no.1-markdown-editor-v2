import type { FormatAction } from './formatCommands'
import { hasPrimaryModifier, isMacPlatform } from '../../lib/platform.ts'

export type ShortcutFormatAction = Extract<
  FormatAction,
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'heading'
  | 'code'
  | 'codeblock'
  | 'link'
  | 'image'
  | 'ul'
  | 'ol'
  | 'task'
>

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
  keyLabel: string
}

const FORMAT_SHORTCUTS: Record<ShortcutFormatAction, FormatShortcutDefinition> = {
  bold: { code: 'KeyB', requiresShift: false, keyLabel: 'B' },
  italic: { code: 'KeyI', requiresShift: false, keyLabel: 'I' },
  underline: { code: 'KeyU', requiresShift: false, keyLabel: 'U' },
  strikethrough: { code: 'Digit5', requiresShift: true, keyLabel: '5' },
  heading: { code: 'KeyH', requiresShift: true, keyLabel: 'H' },
  code: { code: 'Backquote', requiresShift: false, keyLabel: '`' },
  codeblock: { code: 'KeyK', requiresShift: true, keyLabel: 'K' },
  link: { code: 'KeyL', requiresShift: true, keyLabel: 'L' },
  image: { code: 'KeyG', requiresShift: true, keyLabel: 'G' },
  ul: { code: 'KeyU', requiresShift: true, keyLabel: 'U' },
  ol: { code: 'KeyO', requiresShift: true, keyLabel: 'O' },
  task: { code: 'KeyC', requiresShift: true, keyLabel: 'C' },
}

const FORMAT_SHORTCUT_ENTRIES = Object.entries(FORMAT_SHORTCUTS) as [ShortcutFormatAction, FormatShortcutDefinition][]

export function getFormatShortcutLabel(action: ShortcutFormatAction, mac = isMacPlatform()): string {
  const shortcut = FORMAT_SHORTCUTS[action]
  if (mac) {
    return `⌘${shortcut.requiresShift ? '⇧' : ''}${shortcut.keyLabel}`
  }

  return ['Ctrl', shortcut.requiresShift ? 'Shift' : '', shortcut.keyLabel]
    .filter(Boolean)
    .join('+')
}

export function getFormatActionFromShortcut(
  event: ShortcutKeyboardEventLike,
  mac = isMacPlatform()
): ShortcutFormatAction | null {
  if (!hasPrimaryModifier(event, mac) || event.altKey || event.isComposing) {
    return null
  }

  for (const [action, shortcut] of FORMAT_SHORTCUT_ENTRIES) {
    if (event.code === shortcut.code && event.shiftKey === shortcut.requiresShift) {
      return action
    }
  }

  return null
}
