type ShortcutEvent = Pick<
  KeyboardEvent,
  'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
> & {
  isComposing?: boolean
}

export type PrimaryModifierEvent = Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false

  return /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent)
}

export function hasPrimaryModifier(event: PrimaryModifierEvent, mac = isMacPlatform()): boolean {
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

export function getPrimaryModifierLabel(mac = isMacPlatform()): string {
  return mac ? '⌘' : 'Ctrl'
}

export function formatPrimaryShortcut(
  key: string,
  options: {
    alt?: boolean
    shift?: boolean
  } = {},
  mac = isMacPlatform()
): string {
  if (mac) {
    return `${getPrimaryModifierLabel(mac)}${options.alt ? '⌥' : ''}${options.shift ? '⇧' : ''}${key}`
  }

  return [getPrimaryModifierLabel(mac), options.alt ? 'Alt' : '', options.shift ? 'Shift' : '', key]
    .filter(Boolean)
    .join('+')
}

export function matchesPrimaryShortcut(
  event: ShortcutEvent,
  options: {
    key?: string
    code?: string
    shift?: boolean
    alt?: boolean
  },
  mac = isMacPlatform()
): boolean {
  if (event.isComposing) return false
  if (!hasPrimaryModifier(event, mac)) return false
  if ((options.shift ?? false) !== event.shiftKey) return false
  if ((options.alt ?? false) !== event.altKey) return false

  if (options.code) {
    return event.code === options.code
  }

  if (options.key) {
    return event.key.toLowerCase() === options.key.toLowerCase()
  }

  return false
}
