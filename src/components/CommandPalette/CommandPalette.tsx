import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useCommands, type Command } from '../../hooks/useCommands'
import { useRecentFiles } from '../../hooks/useRecentFiles'
import { useEditorStore } from '../../store/editor'
import AppIcon, { type IconName } from '../Icons/AppIcon'
import { useDialogFocusRestore } from '../../hooks/useDialogFocusRestore'

interface Props {
  mode: 'command' | 'file'
  onClose: () => void
}

const CATEGORY_ORDER = ['file', 'edit', 'ai', 'view', 'export', 'theme', 'language'] as const
const COMMAND_PRIORITY = new Map<string, number>([
  ['file.new', 10],
  ['file.open', 11],
  ['file.save', 12],
  ['file.saveAs', 13],
  ['file.checkUpdates', 14],
  ['file.recent.clear', 19],
  ['edit.undo', 100],
  ['edit.redo', 101],
  ['edit.bold', 110],
  ['edit.italic', 111],
  ['edit.underline', 112],
  ['edit.strikethrough', 113],
  ['edit.highlight', 114],
  ['edit.link', 115],
  ['edit.code', 116],
  ['edit.quote', 117],
  ['edit.ul', 118],
  ['edit.ol', 119],
  ['edit.task', 120],
  ['edit.codeBlock', 121],
  ['edit.table', 122],
  ['edit.hr', 123],
  ['edit.image', 124],
  ['edit.h1', 130],
  ['edit.h2', 131],
  ['edit.h3', 132],
  ['edit.h4', 133],
  ['edit.h5', 134],
  ['edit.h6', 135],
  ['edit.find', 140],
  ['edit.replace', 141],
  ['ai.ask', 150],
  ['ai.editSelection', 151],
  ['ai.continueWriting', 152],
  ['ai.summarizeSelection', 153],
  ['ai.translateSelection', 154],
  ['view.source', 210],
  ['view.split', 211],
  ['view.preview', 212],
  ['view.wysiwyg', 213],
  ['view.focus', 214],
  ['view.sidebar', 215],
  ['view.lineNumbers', 216],
  ['view.wordWrap', 217],
  ['view.typewriter', 218],
  ['view.fontSizeIncrease', 219],
  ['view.fontSizeDecrease', 220],
  ['view.fontSizeReset', 221],
  ['export.html', 310],
  ['export.pdf', 311],
  ['export.markdown', 312],
  ['export.copyHtml', 313],
])

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.includes(q)) return true
  // Fuzzy: every char in query must appear in order in text
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

function fuzzyScore(query: string, text: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t === q) return 100
  if (t.startsWith(q)) return 90
  if (t.includes(q)) return 70
  return 50
}

function getMatchScore(query: string, text?: string): number {
  if (!query || !text || !fuzzyMatch(query, text)) return -1
  return fuzzyScore(query, text)
}

function getCommandPriority(command: Command): number {
  const explicit = COMMAND_PRIORITY.get(command.id)
  if (typeof explicit === 'number') return explicit

  if (command.id.startsWith('file.recent.')) return 15
  if (command.id.startsWith('theme.')) return 410
  if (command.id.startsWith('lang.')) return 510

  const categoryOffset = Math.max(CATEGORY_ORDER.indexOf(command.category), 0) * 100
  return categoryOffset + 99
}

function compareCommands(a: Command, b: Command, query: string): number {
  if (query) {
    const scoreDelta =
      Math.max(getMatchScore(query, b.label), getMatchScore(query, b.description)) -
      Math.max(getMatchScore(query, a.label), getMatchScore(query, a.description))

    if (scoreDelta !== 0) return scoreDelta
  }

  const priorityDelta = getCommandPriority(a) - getCommandPriority(b)
  if (priorityDelta !== 0) return priorityDelta

  if (a.shortcut && !b.shortcut) return -1
  if (!a.shortcut && b.shortcut) return 1

  return a.label.localeCompare(b.label)
}

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
      style={{
        background: 'color-mix(in srgb, var(--bg-tertiary) 72%, transparent)',
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </span>
  )
}

function TextBadge({ label }: { label: string }) {
  return (
    <IconBadge>
      <span className="text-[11px] font-semibold leading-none" style={{ fontFamily: 'monospace' }}>
        {label}
      </span>
    </IconBadge>
  )
}

function SvgBadge({ name }: { name: IconName }) {
  return (
    <IconBadge>
      <AppIcon name={name} size={14} />
    </IconBadge>
  )
}

function getCommandIndicator(command: Command, mode: Props['mode']): ReactNode {
  if (command.id.startsWith('file.recent.') || command.id.startsWith('palette.recent.')) return <SvgBadge name="clock" />
  if (mode === 'file') return <SvgBadge name="file" />
  if (command.id.startsWith('ai.')) return <SvgBadge name="sparkles" />
  if (command.id.startsWith('theme.')) return <SvgBadge name="palette" />
  if (command.id.startsWith('lang.')) return <SvgBadge name="globe" />

  const headingMatch = command.id.match(/^edit\.(h[1-6])$/)
  if (headingMatch) return <TextBadge label={headingMatch[1].toUpperCase()} />

  switch (command.id) {
    case 'file.new':
      return <SvgBadge name="filePlus" />
    case 'file.open':
      return <SvgBadge name="folderOpen" />
    case 'file.save':
    case 'file.saveAs':
      return <SvgBadge name="save" />
    case 'file.checkUpdates':
      return <SvgBadge name="download" />
    case 'file.recent.clear':
      return <SvgBadge name="trash" />
    case 'view.source':
      return <SvgBadge name="code" />
    case 'view.split':
      return <SvgBadge name="split" />
    case 'view.preview':
      return <SvgBadge name="eye" />
    case 'view.focus':
      return <SvgBadge name="focus" />
    case 'view.wysiwyg':
      return <SvgBadge name="sparkles" />
    case 'view.sidebar':
      return <SvgBadge name="panel" />
    case 'view.lineNumbers':
      return <SvgBadge name="lineNumbers" />
    case 'view.wordWrap':
      return <SvgBadge name="wrap" />
    case 'view.typewriter':
      return <SvgBadge name="typewriter" />
    case 'view.fontSizeIncrease':
      return <TextBadge label="A+" />
    case 'view.fontSizeDecrease':
      return <TextBadge label="A-" />
    case 'view.fontSizeReset':
      return <TextBadge label="A" />
    case 'edit.find':
      return <SvgBadge name="search" />
    case 'edit.replace':
      return <SvgBadge name="replace" />
    case 'edit.undo':
      return <SvgBadge name="undo" />
    case 'edit.redo':
      return <SvgBadge name="redo" />
    case 'edit.bold':
      return <SvgBadge name="bold" />
    case 'edit.italic':
      return <SvgBadge name="italic" />
    case 'edit.underline':
      return <SvgBadge name="underline" />
    case 'edit.strikethrough':
      return <SvgBadge name="strikethrough" />
    case 'edit.highlight':
      return <SvgBadge name="highlight" />
    case 'edit.code':
      return <SvgBadge name="code" />
    case 'edit.codeBlock':
      return <SvgBadge name="codeBlock" />
    case 'edit.quote':
      return <SvgBadge name="quote" />
    case 'edit.ul':
      return <SvgBadge name="list" />
    case 'edit.ol':
      return <SvgBadge name="orderedList" />
    case 'edit.task':
      return <SvgBadge name="task" />
    case 'edit.hr':
      return <SvgBadge name="hr" />
    case 'edit.table':
      return <SvgBadge name="table" />
    case 'edit.link':
      return <SvgBadge name="link" />
    case 'edit.image':
      return <SvgBadge name="image" />
    case 'export.html':
      return <SvgBadge name="code" />
    case 'export.pdf':
      return <SvgBadge name="print" />
    case 'export.markdown':
      return <SvgBadge name="file" />
    case 'export.copyHtml':
      return <SvgBadge name="copy" />
    default:
      return <SvgBadge name="outline" />
  }
}

export default function CommandPalette({ mode, onClose }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useDialogFocusRestore(inputRef)

  const commands = useCommands()
  const { tabs } = useEditorStore()
  const { recentFiles, openRecent } = useRecentFiles()
  const emptyMessage =
    query.trim().length > 0
      ? t('palette.noResults', { query })
      : mode === 'file'
        ? t('palette.fileEmpty')
        : t('palette.idleTitle')

  const filtered = useMemo(() => {
    if (mode === 'file') {
      const openTabCommands: Command[] = tabs
        .filter((tab) => fuzzyMatch(query, tab.name))
        .map((tab) => ({
          id: tab.id,
          label: tab.name,
          description: tab.path ?? t('palette.unsaved'),
          icon: undefined,
          category: 'file' as const,
          shortcut: undefined,
          action: () => {
            useEditorStore.getState().setActiveTab(tab.id)
          },
        }))

      const openTabPaths = new Set(
        tabs
          .map((tab) => tab.path)
          .filter((path): path is string => typeof path === 'string' && path.length > 0)
      )

      const recentCommands: Command[] = recentFiles
        .filter((file) => !openTabPaths.has(file.path))
        .filter((file) => fuzzyMatch(query, file.name) || fuzzyMatch(query, file.path))
        .map((file) => ({
          id: `palette.recent.${file.path}`,
          label: file.name,
          description: `${t('menu.recentFiles')} · ${file.path}`,
          icon: undefined,
          category: 'file',
          shortcut: undefined,
          action: () => {
            void openRecent(file)
          },
        }))

      return [...openTabCommands, ...recentCommands]
    }

    // Command mode
    const results = commands
      .filter((c) => fuzzyMatch(query, c.label) || (c.description && fuzzyMatch(query, c.description)))
      .sort((a, b) => compareCommands(a, b, query))

    return results
  }, [query, commands, tabs, mode, openRecent, recentFiles, t])

  // Reset selection on filter change
  useEffect(() => { setSelectedIndex(0) }, [filtered.length, query])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`button[data-idx="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')

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

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const execute = useCallback(
    (cmd: Command) => {
      cmd.action()
      onClose()
    },
    [onClose]
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filtered.length === 0) {
        if (e.key === 'Escape') onClose()
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIndex]) execute(filtered[selectedIndex])
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [filtered, selectedIndex, execute, onClose]
  )

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'file' ? t('palette.file') : t('toolbar.commandPalette')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
        className="command-palette w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl animate-in glass-panel"
        style={{
          background: 'var(--glass-bg)',
          borderColor: 'var(--glass-border)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4"
          style={{ borderBottom: '1px solid var(--border)', height: '52px' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>
            {mode === 'file' ? <AppIcon name="file" size={16} /> : <AppIcon name="keyboard" size={16} />}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={mode === 'file' ? t('palette.filePlaceholder') : t('palette.commandPlaceholder')}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
          />
          <kbd
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="flex min-h-0 flex-1 flex-col">
          <ul id="command-palette-results" ref={listRef} className="command-palette__results">
            {filtered.length === 0 && (
              <li className="command-palette__empty">
                <div className="command-palette__empty-copy">{emptyMessage}</div>
              </li>
            )}
            {filtered.map((cmd, idx) => (
              <li key={cmd.id}>
                <button
                  type="button"
                  data-idx={idx}
                  className={`command-palette__item flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                    idx === selectedIndex ? 'command-palette__item--selected' : ''
                  }`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onFocus={() => setSelectedIndex(idx)}
                  onClick={() => execute(cmd)}
                >
                  {getCommandIndicator(cmd, mode)}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{cmd.label}</div>
                    {cmd.description && (
                      <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                        {cmd.description}
                      </div>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <kbd
                      className="flex-shrink-0 rounded px-1.5 py-0.5 text-xs"
                      style={{
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        fontFamily: 'monospace',
                      }}
                    >
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-4 px-4 py-2 text-xs"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <span>↑↓ {t('palette.navigate')}</span>
          <span>↵ {t('palette.execute')}</span>
          <span>ESC {t('palette.close')}</span>
          <div className="flex-1" />
          <span>{t('palette.results', { count: filtered.length })}</span>
        </div>
      </div>
    </div>
  )
}
