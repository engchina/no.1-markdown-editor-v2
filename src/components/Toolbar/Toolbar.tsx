import { Suspense, lazy, useState, useRef, useEffect, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useEditorStore, type ViewMode } from '../../store/editor'
import { LANGUAGES, type Language } from '../../i18n'
import { useFileOps } from '../../hooks/useFileOps'
import { useAnchoredOverlayStyle } from '../../hooks/useAnchoredOverlayStyle'
import { useExport } from '../../hooks/useExport'
import { formatPrimaryShortcut, matchesPrimaryShortcut } from '../../lib/platform'
import { EDITOR_AI_SETUP_OPEN_EVENT } from '../../lib/ai/events'
import { getKeyboardShortcutsShortcutLabel } from '../../lib/keyboardShortcuts'
import type { FormatAction } from '../Editor/formatCommands'
import { getFormatShortcutLabel } from '../Editor/formatShortcuts'
import AppIcon, { type IconName } from '../Icons/AppIcon'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const ThemePanel = lazy(() => import('../ThemePanel/ThemePanel'))
const AISetupPanel = lazy(() => import('../AI/AISetupPanel'))
const AboutPanel = lazy(() => import('../Updates/AboutPanel'))

type ToolbarButtonVariant = 'square' | 'wide' | 'mode'
type ToolbarMenuAlign = 'left' | 'right'

interface ToolbarMenuItem {
  id: string
  label: string
  icon?: IconName
  textIcon?: string
  shortcut?: string
  action: () => void | Promise<void>
}

const VIEW_MODES: { mode: ViewMode; icon: IconName }[] = [
  { mode: 'source', icon: 'code' },
  { mode: 'split', icon: 'split' },
  { mode: 'preview', icon: 'eye' },
]

function emitFormat(action: FormatAction) {
  document.dispatchEvent(new CustomEvent('editor:format', { detail: action }))
}

function ToolbarTextMark({ label }: { label: string }) {
  return (
    <span className="text-[11px] font-semibold leading-none tracking-[0.02em]" style={{ fontFamily: 'monospace' }}>
      {label}
    </span>
  )
}

interface ToolbarBtnProps {
  title: string
  onClick: () => void
  active?: boolean
  children: ReactNode
  disabled?: boolean
  buttonRef?: Ref<HTMLButtonElement>
  variant?: ToolbarButtonVariant
  pressed?: boolean
  hasPopup?: 'menu'
  expanded?: boolean
}

function ToolbarBtn({
  title,
  onClick,
  active,
  children,
  disabled,
  buttonRef,
  variant = 'square',
  pressed,
  hasPopup,
  expanded,
}: ToolbarBtnProps) {
  const sizeClasses =
    variant === 'mode'
      ? 'h-8 px-2.5 gap-1.5'
      : variant === 'wide'
        ? 'h-8 px-2.5 gap-1.5'
        : 'w-8 h-8'

  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-haspopup={hasPopup}
      aria-expanded={expanded === undefined ? undefined : expanded}
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-shrink-0 items-center justify-center rounded-lg hover-scale disabled:opacity-40 ${sizeClasses}`}
      style={{
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-shrink-0 items-center gap-0.5 rounded-lg px-1 py-1"
      style={{
        background: 'color-mix(in srgb, var(--bg-secondary) 90%, transparent)',
        border: '1px solid color-mix(in srgb, var(--border) 72%, transparent)',
      }}
    >
      {children}
    </div>
  )
}

function ToolbarMenuGlyph({ icon, textIcon }: { icon?: IconName; textIcon?: string }) {
  return (
    <span
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
      style={{
        background: 'color-mix(in srgb, var(--bg-tertiary) 78%, transparent)',
        color: 'var(--text-muted)',
      }}
    >
      {icon ? <AppIcon name={icon} size={14} /> : <ToolbarTextMark label={textIcon ?? ''} />}
    </span>
  )
}

function ToolbarMenu({
  items,
  onClose,
  triggerRef,
  label,
  align = 'left',
  width = 216,
  zoom = 100,
}: {
  items: ToolbarMenuItem[]
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
  label: string
  align?: ToolbarMenuAlign
  width?: number
  zoom?: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const overlayStyle = useAnchoredOverlayStyle(triggerRef, { align, width, zoom })

  const focusItem = (index: number) => {
    const item = itemRefs.current[index]
    item?.focus()
  }

  const closeAndRestoreFocus = () => {
    onClose()
    queueMicrotask(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return

      if (ref.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, triggerRef])

  useEffect(() => {
    queueMicrotask(() => focusItem(0))
  }, [])

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = itemRefs.current.findIndex((item) => item === document.activeElement)
    const lastIndex = items.length - 1

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeAndRestoreFocus()
      return
    }

    if (event.key === 'Tab') {
      onClose()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      focusItem(currentIndex >= 0 && currentIndex < lastIndex ? currentIndex + 1 : 0)
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      focusItem(currentIndex > 0 ? currentIndex - 1 : lastIndex)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusItem(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusItem(lastIndex)
    }
  }

  if (typeof document === 'undefined' || overlayStyle === null) return null

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      aria-orientation="vertical"
      data-toolbar-menu="true"
      onKeyDown={onMenuKeyDown}
      className="fixed z-[80] overflow-x-hidden overflow-y-auto rounded-lg shadow-lg animate-in glass-panel"
      style={{
        ...overlayStyle,
        background: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
      }}
    >
      {items.map(({ id, label: itemLabel, icon, textIcon, shortcut, action }, index) => (
        <button
          key={id}
          ref={(element) => {
            itemRefs.current[index] = element
          }}
          type="button"
          role="menuitem"
          tabIndex={index === 0 ? 0 : -1}
          data-toolbar-menu-item="true"
          onClick={() => {
            void action()
            onClose()
          }}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
          style={{ color: 'var(--text-primary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <ToolbarMenuGlyph icon={icon} textIcon={textIcon} />
          <span className="min-w-0 flex-1 truncate">{itemLabel}</span>
          {shortcut && (
            <span className="ml-2 flex-shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
              {shortcut}
            </span>
          )}
        </button>
      ))}
    </div>,
    document.body
  )
}

function ExportMenu({
  onClose,
  triggerRef,
  zoom,
}: {
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
  zoom: number
}) {
  const { t } = useTranslation()
  const { exportHtml, exportPdf, exportMarkdown, copyAsHtml, copyHtmlSource } = useExport()
  const [copiedItem, setCopiedItem] = useState<'rich-html' | 'html-source' | null>(null)

  const markCopied = (item: 'rich-html' | 'html-source') => {
    setCopiedItem(item)
    setTimeout(() => setCopiedItem(null), 1500)
  }

  const items: ToolbarMenuItem[] = [
    { id: 'html', label: t('export.html'), icon: 'code', action: exportHtml },
    { id: 'pdf', label: t('export.pdf'), icon: 'print', action: exportPdf },
    { id: 'markdown', label: t('export.markdown'), icon: 'file', action: exportMarkdown },
    {
      id: 'copy-rich-html',
      label: copiedItem === 'rich-html' ? t('export.copied') : t('export.copyRichHtml'),
      icon: 'copy',
      action: async () => {
        if (await copyAsHtml()) markCopied('rich-html')
      },
    },
    {
      id: 'copy-html-source',
      label: copiedItem === 'html-source' ? t('export.copied') : t('export.copyHtmlSource'),
      icon: 'code',
      action: async () => {
        if (await copyHtmlSource()) markCopied('html-source')
      },
    },
  ]

  return <ToolbarMenu items={items} onClose={onClose} triggerRef={triggerRef} label={t('toolbar.export')} width={230} zoom={zoom} />
}

export default function Toolbar({
  onOpenPalette,
  onOpenShortcuts,
  shortcutsOpen = false,
  saving,
}: {
  onOpenPalette?: () => void
  onOpenShortcuts?: () => void
  shortcutsOpen?: boolean
  saving?: boolean
}) {
  const { t } = useTranslation()
  const {
    viewMode,
    setViewMode,
    sidebarOpen,
    setSidebarOpen,
    focusMode,
    setFocusMode,
    wysiwygMode,
    setWysiwygMode,
    language,
    setLanguage,
    tabs,
    activeTabId,
    zoom,
  } = useEditorStore()

  const { newFile, openFile, saveFile, saveFileAs } = useFileOps()
  const [showExport, setShowExport] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showAISetup, setShowAISetup] = useState(false)
  const [showTheme, setShowTheme] = useState(false)
  const [showHeadings, setShowHeadings] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const exportButtonRef = useRef<HTMLButtonElement | null>(null)
  const aboutButtonRef = useRef<HTMLButtonElement | null>(null)
  const aiSetupButtonRef = useRef<HTMLButtonElement | null>(null)
  const themeButtonRef = useRef<HTMLButtonElement | null>(null)
  const headingButtonRef = useRef<HTMLButtonElement | null>(null)
  const moreActionsButtonRef = useRef<HTMLButtonElement | null>(null)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const newShortcut = formatPrimaryShortcut('N')
  const openShortcut = formatPrimaryShortcut('O')
  const saveShortcut = formatPrimaryShortcut('S')
  const commandPaletteShortcut = formatPrimaryShortcut('P', { shift: true })
  const shortcutsShortcut = getKeyboardShortcutsShortcutLabel()
  const sidebarShortcut = formatPrimaryShortcut('\\')
  const headingShortcut = getFormatShortcutLabel('heading')
  const boldShortcut = getFormatShortcutLabel('bold')
  const italicShortcut = getFormatShortcutLabel('italic')

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (matchesPrimaryShortcut(event, { key: 'n' })) {
        event.preventDefault()
        newFile()
      }
      if (matchesPrimaryShortcut(event, { key: 'o' })) {
        event.preventDefault()
        void openFile()
      }
      if (matchesPrimaryShortcut(event, { key: 's', shift: true })) {
        event.preventDefault()
        void saveFileAs()
      }
      if (matchesPrimaryShortcut(event, { key: 's' })) {
        event.preventDefault()
        void saveFile()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [newFile, openFile, saveFile, saveFileAs])

  useEffect(() => {
    const openAISetupPanel = () => {
      setShowAISetup(true)
      setShowTheme(false)
      setShowAbout(false)
      window.requestAnimationFrame(() => aiSetupButtonRef.current?.focus())
    }

    document.addEventListener(EDITOR_AI_SETUP_OPEN_EVENT, openAISetupPanel)
    return () => document.removeEventListener(EDITOR_AI_SETUP_OPEN_EVENT, openAISetupPanel)
  }, [])

  const headingItems: ToolbarMenuItem[] = [
    { id: 'h1', label: t('toolbar.h1'), textIcon: 'H1', action: () => emitFormat('h1') },
    { id: 'h2', label: t('toolbar.h2'), textIcon: 'H2', action: () => emitFormat('h2') },
    { id: 'h3', label: t('toolbar.h3'), textIcon: 'H3', action: () => emitFormat('h3') },
    { id: 'h4', label: t('toolbar.h4'), textIcon: 'H4', action: () => emitFormat('h4') },
    { id: 'h5', label: t('toolbar.h5'), textIcon: 'H5', action: () => emitFormat('h5') },
    { id: 'h6', label: t('toolbar.h6'), textIcon: 'H6', action: () => emitFormat('h6') },
  ]

  const formatItems: ToolbarMenuItem[] = [
    { id: 'quote', label: t('toolbar.quote'), icon: 'quote', action: () => emitFormat('quote') },
    { id: 'ul', label: t('toolbar.ul'), icon: 'list', shortcut: getFormatShortcutLabel('ul'), action: () => emitFormat('ul') },
    { id: 'ol', label: t('toolbar.ol'), icon: 'orderedList', shortcut: getFormatShortcutLabel('ol'), action: () => emitFormat('ol') },
    { id: 'task', label: t('toolbar.task'), icon: 'task', shortcut: getFormatShortcutLabel('task'), action: () => emitFormat('task') },
    { id: 'underline', label: t('toolbar.underline'), icon: 'underline', shortcut: getFormatShortcutLabel('underline'), action: () => emitFormat('underline') },
    {
      id: 'strikethrough',
      label: t('toolbar.strikethrough'),
      icon: 'strikethrough',
      shortcut: getFormatShortcutLabel('strikethrough'),
      action: () => emitFormat('strikethrough'),
    },
    { id: 'highlight', label: t('toolbar.highlight'), icon: 'highlight', action: () => emitFormat('highlight') },
    { id: 'link', label: t('toolbar.link'), icon: 'link', shortcut: getFormatShortcutLabel('link'), action: () => emitFormat('link') },
    { id: 'code', label: t('toolbar.code'), icon: 'code', shortcut: getFormatShortcutLabel('code'), action: () => emitFormat('code') },
    { id: 'codeblock', label: t('toolbar.codeBlock'), icon: 'codeBlock', shortcut: getFormatShortcutLabel('codeblock'), action: () => emitFormat('codeblock') },
    { id: 'table', label: t('toolbar.table'), icon: 'table', action: () => emitFormat('table') },
    { id: 'hr', label: t('toolbar.hr'), icon: 'hr', action: () => emitFormat('hr') },
    { id: 'image', label: t('toolbar.image'), icon: 'image', shortcut: getFormatShortcutLabel('image'), action: () => emitFormat('image') },
  ]

  return (
    <div
      role="toolbar"
      aria-label={t('app.name')}
      className="relative flex min-w-max flex-shrink-0 items-center gap-1.5 rounded-xl px-3 transition-colors duration-150 glass-panel"
      style={{
        height: '42px',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <ToolbarBtn
        title={`${t('toolbar.toggleSidebar')} (${sidebarShortcut})`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        active={sidebarOpen}
        pressed={sidebarOpen}
      >
        <AppIcon name="panel" size={16} />
      </ToolbarBtn>

      <ToolbarGroup label={t('menu.file')}>
        <ToolbarBtn title={`${t('toolbar.new')} (${newShortcut})`} onClick={newFile}>
          <AppIcon name="filePlus" size={16} />
        </ToolbarBtn>
        <ToolbarBtn title={`${t('toolbar.open')} (${openShortcut})`} onClick={() => void openFile()}>
          <AppIcon name="folderOpen" size={16} />
        </ToolbarBtn>
        <ToolbarBtn title={`${t('toolbar.save')} (${saveShortcut})`} onClick={() => void saveFile()}>
          <AppIcon name="save" size={16} />
        </ToolbarBtn>
        <div className="relative">
          <ToolbarBtn
            title={t('toolbar.export')}
            buttonRef={exportButtonRef}
            onClick={() => setShowExport((open) => !open)}
            active={showExport}
            hasPopup="menu"
            expanded={showExport}
          >
            <AppIcon name="download" size={16} />
          </ToolbarBtn>
          {showExport && <ExportMenu onClose={() => setShowExport(false)} triggerRef={exportButtonRef} zoom={zoom} />}
        </div>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.format')}>
        <div className="relative">
          <ToolbarBtn
            title={`${t('toolbar.headings')} (${headingShortcut})`}
            buttonRef={headingButtonRef}
            onClick={() => setShowHeadings((open) => !open)}
            active={showHeadings}
            variant="wide"
            hasPopup="menu"
            expanded={showHeadings}
          >
            <ToolbarTextMark label="H" />
            <AppIcon name="chevronDown" size={14} />
          </ToolbarBtn>
          {showHeadings && (
            <ToolbarMenu
              items={headingItems}
              onClose={() => setShowHeadings(false)}
              triggerRef={headingButtonRef}
              label={t('toolbar.headings')}
              width={176}
              zoom={zoom}
            />
          )}
        </div>

        <ToolbarBtn title={`${t('toolbar.bold')} (${boldShortcut})`} onClick={() => emitFormat('bold')}>
          <AppIcon name="bold" size={16} />
        </ToolbarBtn>
        <ToolbarBtn title={`${t('toolbar.italic')} (${italicShortcut})`} onClick={() => emitFormat('italic')}>
          <AppIcon name="italic" size={16} />
        </ToolbarBtn>

        <div className="relative">
          <ToolbarBtn
            title={t('toolbar.moreActions')}
            buttonRef={moreActionsButtonRef}
            onClick={() => setShowMoreActions((open) => !open)}
            active={showMoreActions}
            hasPopup="menu"
            expanded={showMoreActions}
          >
            <AppIcon name="format" size={16} />
          </ToolbarBtn>
          {showMoreActions && (
            <ToolbarMenu
              items={formatItems}
              onClose={() => setShowMoreActions(false)}
              triggerRef={moreActionsButtonRef}
              label={t('toolbar.moreActions')}
              width={272}
              zoom={zoom}
            />
          )}
        </div>
      </ToolbarGroup>

      <div className="flex-1" />

      {!isTauri && activeTab && (
        <span className="flex max-w-xs items-center gap-2 truncate text-sm" style={{ color: 'var(--text-secondary)' }}>
          {saving ? (
            <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
          ) : activeTab.isDirty ? (
            <span style={{ color: 'var(--accent)' }}>●</span>
          ) : null}
          {activeTab.name}
        </span>
      )}

      <div className="flex-1" />

      <ToolbarBtn
        title={wysiwygMode ? t('commands.disableWysiwyg') : t('commands.enableWysiwyg')}
        onClick={() => setWysiwygMode(!wysiwygMode)}
        active={wysiwygMode}
        pressed={wysiwygMode}
        variant="mode"
      >
        <AppIcon name="wysiwyg" size={16} />
        <span className="text-xs font-medium">{t('toolbar.wysiwyg')}</span>
      </ToolbarBtn>

      <ToolbarBtn title={t('toolbar.focusMode')} onClick={() => setFocusMode(!focusMode)} active={focusMode} pressed={focusMode} variant="mode">
        <span data-toolbar-action="focus-mode" className="contents">
        <AppIcon name="focus" size={16} />
        <span className="text-xs font-medium">{t('viewMode.focus')}</span>
        </span>
      </ToolbarBtn>

      <ToolbarGroup label={t('toolbar.viewMode')}>
        {VIEW_MODES.map(({ mode, icon }) => (
          <ToolbarBtn key={mode} title={t(`viewMode.${mode}`)} onClick={() => setViewMode(mode)} active={viewMode === mode} pressed={viewMode === mode}>
            <span data-view-mode={mode} className="contents">
            <AppIcon name={icon} size={15} />
            </span>
          </ToolbarBtn>
        ))}
      </ToolbarGroup>

      <ToolbarBtn title={`${t('toolbar.commandPalette')} (${commandPaletteShortcut})`} onClick={() => onOpenPalette?.()}>
        <span data-toolbar-action="command-palette" className="contents">
        <AppIcon name="command" size={16} />
        </span>
      </ToolbarBtn>

      <ToolbarBtn
        title={`${t('shortcuts.open')} (${shortcutsShortcut})`}
        onClick={() => {
          setShowTheme(false)
          setShowAISetup(false)
          setShowAbout(false)
          onOpenShortcuts?.()
        }}
        active={shortcutsOpen}
        pressed={shortcutsOpen}
      >
        <span data-toolbar-action="keyboard-shortcuts" className="contents">
        <AppIcon name="shortcuts" size={17} />
        </span>
      </ToolbarBtn>

      <select
        data-language-select="true"
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
        className="flex-shrink-0 cursor-pointer rounded-[10px] px-2 py-0.5 text-xs outline-none"
        style={{
          height: '32px',
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
        }}
      >
        {LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.nativeLabel}
          </option>
        ))}
      </select>

      <div className="relative">
        <ToolbarBtn
          title={t('toolbar.appearance')}
          buttonRef={themeButtonRef}
          onClick={() => {
            setShowTheme((open) => !open)
            setShowAISetup(false)
            setShowAbout(false)
          }}
          active={showTheme}
        >
          <span data-toolbar-action="settings" className="contents">
          <AppIcon name="settings" size={16} />
          </span>
        </ToolbarBtn>
        {showTheme && (
          <Suspense fallback={null}>
            <ThemePanel onClose={() => setShowTheme(false)} triggerRef={themeButtonRef} />
          </Suspense>
        )}
      </div>

      <div className="relative">
        <ToolbarBtn
          title={t('toolbar.aiSetup')}
          buttonRef={aiSetupButtonRef}
          onClick={() => {
            setShowAISetup((open) => !open)
            setShowTheme(false)
            setShowAbout(false)
          }}
          active={showAISetup}
        >
          <span data-toolbar-action="ai-setup" className="contents">
          <AppIcon name="sparkles" size={16} />
          </span>
        </ToolbarBtn>
        {showAISetup && (
          <Suspense fallback={null}>
            <AISetupPanel onClose={() => setShowAISetup(false)} triggerRef={aiSetupButtonRef} />
          </Suspense>
        )}
      </div>

      <div className="relative">
        <ToolbarBtn
          title={t('toolbar.about')}
          buttonRef={aboutButtonRef}
          onClick={() => {
            setShowAbout((open) => !open)
            setShowTheme(false)
            setShowAISetup(false)
          }}
          active={showAbout}
        >
          <span data-toolbar-action="about" className="contents">
          <AppIcon name="infoCircle" size={16} />
          </span>
        </ToolbarBtn>
        {showAbout && (
          <Suspense fallback={null}>
            <AboutPanel onClose={() => setShowAbout(false)} triggerRef={aboutButtonRef} />
          </Suspense>
        )}
      </div>
    </div>
  )
}
