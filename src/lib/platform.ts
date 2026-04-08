type ShortcutEvent = Pick<
  KeyboardEvent,
  'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
>

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false

  return /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent)
}

export function getPrimaryModifierLabel(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl'
}

export function formatPrimaryShortcut(
  key: string,
  options: {
    shift?: boolean
  } = {}
): string {
  if (isMacPlatform()) {
    return `${getPrimaryModifierLabel()}${options.shift ? '⇧' : ''}${key}`
  }

  return [getPrimaryModifierLabel(), options.shift ? 'Shift' : '', key]
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
  }
): boolean {
  if (!(event.ctrlKey || event.metaKey)) return false
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
