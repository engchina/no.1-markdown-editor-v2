import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useCommands, type Command } from '../../hooks/useCommands'
import { useDialogFocusRestore } from '../../hooks/useDialogFocusRestore'
import { formatPrimaryShortcut, isMacPlatform } from '../../lib/platform'
import AppIcon, { type IconName } from '../Icons/AppIcon'

interface Props {
  onClose: () => void
}

interface ShortcutHelpItem {
  id: string
  label: string
  shortcut: string
  category: Command['category']
  order: number
}

interface KeyboardShortcutsFrameBounds {
  top: number
  bottom: number
}

const LEFT_SHORTCUT_SECTION_CATEGORIES: Command['category'][] = ['file', 'view', 'ai', 'help']
const RIGHT_SHORTCUT_SECTION_CATEGORIES: Command['category'][] = ['edit', 'export', 'theme', 'language']
const CATEGORY_ORDER: Command['category'][] = [
  ...LEFT_SHORTCUT_SECTION_CATEGORIES,
  ...RIGHT_SHORTCUT_SECTION_CATEGORIES,
]
const KEYBOARD_SHORTCUTS_SOURCE_SURFACE_SELECTOR = '[data-source-editor-surface="true"], .cm-editor'
const KEYBOARD_SHORTCUTS_SOURCE_EDGE_GAP_PX = 16
const DEFAULT_KEYBOARD_SHORTCUTS_FRAME_BOUNDS: KeyboardShortcutsFrameBounds = { top: 0, bottom: 0 }

function getShortcutCategoryLabel(category: Command['category'], t: (key: string) => string): string {
  switch (category) {
    case 'file':
      return t('shortcuts.categories.file')
    case 'edit':
      return t('shortcuts.categories.edit')
    case 'view':
      return t('shortcuts.categories.view')
    case 'ai':
      return t('shortcuts.categories.ai')
    case 'help':
      return t('shortcuts.categories.help')
    case 'export':
      return t('palette.export')
    case 'theme':
      return t('palette.theme')
    case 'language':
      return t('palette.language')
  }
}

function getShortcutCategoryIcon(category: Command['category']): IconName {
  switch (category) {
    case 'file':
      return 'file'
    case 'edit':
      return 'format'
    case 'view':
      return 'eye'
    case 'ai':
      return 'sparkles'
    case 'help':
      return 'shortcuts'
    case 'export':
      return 'download'
    case 'theme':
      return 'palette'
    case 'language':
      return 'globe'
  }
}

function compareShortcutItems(a: ShortcutHelpItem, b: ShortcutHelpItem): number {
  const categoryDelta = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  if (categoryDelta !== 0) return categoryDelta

  const orderDelta = a.order - b.order
  if (orderDelta !== 0) return orderDelta

  return a.label.localeCompare(b.label)
}

function getFocusableElements(dialog: HTMLDivElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
}

function formatShiftShortcut(key: string): string {
  return isMacPlatform() ? `⇧${key}` : `Shift+${key}`
}

function formatAltShortcut(key: string): string {
  return isMacPlatform() ? `⌥${key}` : `Alt+${key}`
}

function formatShiftAltShortcut(key: string): string {
  return isMacPlatform() ? `⇧⌥${key}` : `Shift+Alt+${key}`
}

export default function KeyboardShortcutsDialog({ onClose }: Props) {
  const { t } = useTranslation()
  const commands = useCommands()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [dialogFrameBounds, setDialogFrameBounds] = useState<KeyboardShortcutsFrameBounds>(() =>
    resolveKeyboardShortcutsSourceFrameBounds()
  )

  useDialogFocusRestore(closeButtonRef)

  const sectionColumns = useMemo(() => {
    const commandItems = commands
      .map<ShortcutHelpItem | null>((command, index) => {
        if (!command.shortcut) return null
        if (command.id.startsWith('file.recent.')) return null

        return {
          id: command.id,
          label: command.label,
          shortcut: command.shortcut,
          category: command.category,
          order: index,
        }
      })
      .filter((item): item is ShortcutHelpItem => item !== null)

    const extraItems: ShortcutHelpItem[] = [
      {
        id: 'file.switchOpen',
        label: t('shortcuts.switchFile'),
        shortcut: formatPrimaryShortcut('P'),
        category: 'file',
        order: 4.5,
      },
      {
        id: 'view.commandPalette',
        label: t('toolbar.commandPalette'),
        shortcut: formatPrimaryShortcut('P', { shift: true }),
        category: 'view',
        order: -1,
      },
      {
        id: 'edit.findNextMatch',
        label: t('shortcuts.editor.findNextMatch'),
        shortcut: `${formatPrimaryShortcut('G')} / F3`,
        category: 'edit',
        order: 1000,
      },
      {
        id: 'edit.findPreviousMatch',
        label: t('shortcuts.editor.findPreviousMatch'),
        shortcut: `${formatPrimaryShortcut('G', { shift: true })} / ${formatShiftShortcut('F3')}`,
        category: 'edit',
        order: 1001,
      },
      {
        id: 'edit.selectNextMatch',
        label: t('shortcuts.editor.selectNextMatch'),
        shortcut: formatPrimaryShortcut('D'),
        category: 'edit',
        order: 1002,
      },
      {
        id: 'edit.goToLine',
        label: t('shortcuts.editor.goToLine'),
        shortcut: formatPrimaryShortcut('G', { alt: true }),
        category: 'edit',
        order: 1003,
      },
      {
        id: 'edit.indentLess',
        label: t('shortcuts.editor.indentLess'),
        shortcut: formatPrimaryShortcut('['),
        category: 'edit',
        order: 1004,
      },
      {
        id: 'edit.indentMore',
        label: t('shortcuts.editor.indentMore'),
        shortcut: formatPrimaryShortcut(']'),
        category: 'edit',
        order: 1005,
      },
      {
        id: 'edit.insertBlankLine',
        label: t('shortcuts.editor.insertBlankLine'),
        shortcut: formatPrimaryShortcut('Enter'),
        category: 'edit',
        order: 1006,
      },
      {
        id: 'edit.moveLineUp',
        label: t('shortcuts.editor.moveLineUp'),
        shortcut: formatAltShortcut('ArrowUp'),
        category: 'edit',
        order: 1007,
      },
      {
        id: 'edit.moveLineDown',
        label: t('shortcuts.editor.moveLineDown'),
        shortcut: formatAltShortcut('ArrowDown'),
        category: 'edit',
        order: 1008,
      },
      {
        id: 'edit.copyLineUp',
        label: t('shortcuts.editor.copyLineUp'),
        shortcut: formatShiftAltShortcut('ArrowUp'),
        category: 'edit',
        order: 1009,
      },
      {
        id: 'edit.copyLineDown',
        label: t('shortcuts.editor.copyLineDown'),
        shortcut: formatShiftAltShortcut('ArrowDown'),
        category: 'edit',
        order: 1010,
      },
    ]

    const items = [...commandItems, ...extraItems].sort(compareShortcutItems)

    const sections = CATEGORY_ORDER.map((category) => ({
      category,
      label: getShortcutCategoryLabel(category, t),
      icon: getShortcutCategoryIcon(category),
      items: items.filter((item) => item.category === category),
    })).filter((section) => section.items.length > 0)

    return [
      sections.filter((section) => LEFT_SHORTCUT_SECTION_CATEGORIES.includes(section.category)),
      sections.filter((section) => RIGHT_SHORTCUT_SECTION_CATEGORIES.includes(section.category)),
    ]
  }, [commands, t])

  const totalShortcutCount = sectionColumns.reduce(
    (total, column) => total + column.reduce((columnTotal, section) => columnTotal + section.items.length, 0),
    0
  )

  useLayoutEffect(() => {
    let resizeObserver: ResizeObserver | null = null
    let rafId: number | null = null

    const updateFrameBounds = () => {
      rafId = null
      const nextBounds = resolveKeyboardShortcutsSourceFrameBounds()
      setDialogFrameBounds((currentBounds) =>
        areKeyboardShortcutsFrameBoundsEqual(currentBounds, nextBounds) ? currentBounds : nextBounds
      )
    }

    const scheduleFrameBoundsUpdate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(updateFrameBounds)
    }

    updateFrameBounds()
    window.addEventListener('resize', scheduleFrameBoundsUpdate)
    window.addEventListener('orientationchange', scheduleFrameBoundsUpdate)

    const sourceSurface = getKeyboardShortcutsSourceSurface()
    if (sourceSurface && typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(scheduleFrameBoundsUpdate)
      resizeObserver.observe(sourceSurface)
    }

    return () => {
      window.removeEventListener('resize', scheduleFrameBoundsUpdate)
      window.removeEventListener('orientationchange', scheduleFrameBoundsUpdate)
      resizeObserver?.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return

      const focusable = getFocusableElements(dialog)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return

    event.preventDefault()
    onClose()
  }

  if (typeof document === 'undefined') return null

  const dialogFrameStyle: CSSProperties = {
    top: `${dialogFrameBounds.top}px`,
    bottom: `${dialogFrameBounds.bottom}px`,
    paddingTop: `${KEYBOARD_SHORTCUTS_SOURCE_EDGE_GAP_PX}px`,
    paddingBottom: `${KEYBOARD_SHORTCUTS_SOURCE_EDGE_GAP_PX}px`,
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        data-keyboard-shortcuts-frame="source-editor"
        className="pointer-events-none fixed inset-x-0 flex items-center justify-center px-4 sm:px-6"
        style={dialogFrameStyle}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-shortcuts-title"
          aria-describedby="keyboard-shortcuts-description"
          data-keyboard-shortcuts-dialog="true"
          onKeyDown={onDialogKeyDown}
          className="pointer-events-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl animate-in glass-panel"
          style={{
            maxHeight: '100%',
            background: 'color-mix(in srgb, var(--bg-primary) 96%, transparent)',
            borderColor: 'color-mix(in srgb, var(--border) 88%, transparent)',
          }}
        >
          <div
            className="flex flex-shrink-0 items-start gap-3 px-5 py-4 sm:px-6"
            style={{
              borderBottom: '1px solid color-mix(in srgb, var(--border) 86%, transparent)',
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 72%, transparent), color-mix(in srgb, var(--bg-primary) 96%, transparent))',
            }}
          >
            <span
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{
                background: 'color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))',
                color: 'var(--accent)',
                border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
              }}
            >
              <AppIcon name="shortcuts" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="keyboard-shortcuts-title" className="truncate text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('shortcuts.title')}
              </h2>
              <p id="keyboard-shortcuts-description" className="mt-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('shortcuts.subtitle')}
              </p>
            </div>
            <span
              className="mt-1 hidden flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex"
              style={{
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                color: 'var(--accent)',
                border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
              }}
            >
              {t('shortcuts.count', { count: totalShortcutCount })}
            </span>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label={t('palette.close')}
              title={t('palette.close')}
              onClick={onClose}
              className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(event) => (event.currentTarget.style.background = 'var(--bg-tertiary)')}
              onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
            >
              <AppIcon name="x" size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6" style={{ scrollbarGutter: 'stable' }}>
            <div className="grid items-start gap-3 lg:grid-cols-2">
              {sectionColumns.map((column, columnIndex) => (
                <div key={columnIndex} className="grid min-w-0 gap-3">
                  {column.map((section) => (
                    <section key={section.category} className="min-w-0">
                      <div
                        className="overflow-hidden rounded-xl"
                        style={{
                          border: '1px solid color-mix(in srgb, var(--border) 88%, transparent)',
                          background: 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
                        }}
                      >
                        <div
                          className="flex min-h-11 items-center gap-2.5 px-3.5 py-2.5"
                          style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 76%, transparent)' }}
                        >
                          <span
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                            style={{
                              background: 'color-mix(in srgb, var(--bg-tertiary) 82%, transparent)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <AppIcon name={section.icon} size={14} />
                          </span>
                          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {section.label}
                          </h3>
                          <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                            {section.items.length}
                          </span>
                        </div>
                        {section.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex min-h-11 items-center gap-3 px-3.5 py-2.5 transition-colors"
                            style={{ borderTop: item === section.items[0] ? undefined : '1px solid color-mix(in srgb, var(--border) 58%, transparent)' }}
                            onMouseEnter={(event) => (event.currentTarget.style.background = 'color-mix(in srgb, var(--bg-tertiary) 54%, transparent)')}
                            onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
                          >
                            <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--text-primary)' }}>
                              {item.label}
                            </span>
                            <kbd
                              className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold leading-none"
                              style={{
                                background: 'color-mix(in srgb, var(--bg-tertiary) 88%, var(--text-primary) 6%)',
                                color: 'var(--text-primary)',
                                border: '1px solid color-mix(in srgb, var(--border) 82%, var(--text-primary) 14%)',
                                boxShadow: 'inset 0 -1px 0 color-mix(in srgb, var(--text-primary) 18%, transparent), 0 1px 2px rgba(0,0,0,0.08)',
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                              }}
                            >
                              {item.shortcut}
                            </kbd>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function getKeyboardShortcutsSourceSurface(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>(KEYBOARD_SHORTCUTS_SOURCE_SURFACE_SELECTOR)
}

function resolveKeyboardShortcutsSourceFrameBounds(): KeyboardShortcutsFrameBounds {
  if (typeof window === 'undefined') return DEFAULT_KEYBOARD_SHORTCUTS_FRAME_BOUNDS

  const sourceSurface = getKeyboardShortcutsSourceSurface()
  if (!sourceSurface) return DEFAULT_KEYBOARD_SHORTCUTS_FRAME_BOUNDS

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return DEFAULT_KEYBOARD_SHORTCUTS_FRAME_BOUNDS
  }

  const rect = sourceSurface.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return DEFAULT_KEYBOARD_SHORTCUTS_FRAME_BOUNDS
  }

  const top = clampKeyboardShortcutsFrameInset(Math.round(rect.top), viewportHeight)
  const bottom = clampKeyboardShortcutsFrameInset(Math.round(viewportHeight - rect.bottom), viewportHeight)

  if (top + bottom >= viewportHeight) return DEFAULT_KEYBOARD_SHORTCUTS_FRAME_BOUNDS
  return { top, bottom }
}

function clampKeyboardShortcutsFrameInset(value: number, viewportHeight: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), viewportHeight)
}

function areKeyboardShortcutsFrameBoundsEqual(
  currentBounds: KeyboardShortcutsFrameBounds,
  nextBounds: KeyboardShortcutsFrameBounds
): boolean {
  return currentBounds.top === nextBounds.top && currentBounds.bottom === nextBounds.bottom
}
