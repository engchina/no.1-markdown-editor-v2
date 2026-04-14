import { useState, useRef, useEffect, type ReactNode, type Ref, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useEditorStore, type ViewMode } from '../../store/editor'
import { LANGUAGES, type Language } from '../../i18n'
import { useFileOps } from '../../hooks/useFileOps'
import { useAnchoredOverlayStyle } from '../../hooks/useAnchoredOverlayStyle'
import { useExport } from '../../hooks/useExport'
import { formatPrimaryShortcut } from '../../lib/platform'
import type { FormatAction } from '../Editor/formatCommands'
import ThemePanel from '../ThemePanel/ThemePanel'
import AboutPanel from '../Updates/AboutPanel'
import AppIcon, { type IconName } from '../Icons/AppIcon'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

type ToolbarButtonVariant = 'square' | 'wide'
type ToolbarMenuAlign = 'left' | 'right'

interface ToolbarMenuItem {
  id: string
  label: string
  icon?: IconName
  textIcon?: string
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
}

function ToolbarBtn({
  title,
  onClick,
  active,
  children,
  disabled,
  buttonRef,
  variant = 'square',
}: ToolbarBtnProps) {
  const sizeClasses = variant === 'wide' ? 'h-8 px-2.5 gap-1.5' : 'w-8 h-8'

  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-shrink-0 items-center justify-center rounded-[10px] hover-scale disabled:opacity-40 transition-all duration-200 ${sizeClasses}`}
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
      className="flex flex-shrink-0 items-center gap-0.5 rounded-[14px] px-1 py-1"
      style={{
        background: 'color-mix(in srgb, var(--bg-secondary) 84%, transparent)',
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
  align = 'left',
  width = 216,
}: {
  items: ToolbarMenuItem[]
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
  align?: ToolbarMenuAlign
  width?: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const overlayStyle = useAnchoredOverlayStyle(triggerRef, { align, width })

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

  if (typeof document === 'undefined' || overlayStyle === null) return null

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[80] overflow-x-hidden overflow-y-auto rounded-xl shadow-xl animate-in glass-panel"
      style={{
        ...overlayStyle,
        background: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
      }}
    >
      {items.map(({ id, label, icon, textIcon, action }) => (
        <button
          key={id}
          type="button"
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
          <span>{label}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}

function ExportMenu({
  onClose,
  triggerRef,
}: {
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const { t } = useTranslation()
  const { exportHtml, exportPdf, exportMarkdown, copyAsHtml } = useExport()
  const [copied, setCopied] = useState(false)

  const items: ToolbarMenuItem[] = [
    { id: 'html', label: t('export.html'), icon: 'code', action: exportHtml },
    { id: 'pdf', label: t('export.pdf'), icon: 'print', action: exportPdf },
    { id: 'markdown', label: t('export.markdown'), icon: 'file', action: exportMarkdown },
    {
      id: 'copy-html',
      label: copied ? t('export.copied') : t('export.copyHtml'),
      icon: 'copy',
      action: async () => {
        await copyAsHtml()
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
    },
  ]

  return <ToolbarMenu items={items} onClose={onClose} triggerRef={triggerRef} width={200} />
}

export default function Toolbar({ onOpenPalette, saving }: { onOpenPalette?: () => void; saving?: boolean }) {
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
  } = useEditorStore()

  const { newFile, openFile, saveFile, saveFileAs } = useFileOps()
  const [showExport, setShowExport] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showTheme, setShowTheme] = useState(false)
  const [showHeadings, setShowHeadings] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const exportButtonRef = useRef<HTMLButtonElement | null>(null)
  const aboutButtonRef = useRef<HTMLButtonElement | null>(null)
  const themeButtonRef = useRef<HTMLButtonElement | null>(null)
  const headingButtonRef = useRef<HTMLButtonElement | null>(null)
  const moreActionsButtonRef = useRef<HTMLButtonElement | null>(null)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const newShortcut = formatPrimaryShortcut('N')
  const openShortcut = formatPrimaryShortcut('O')
  const saveShortcut = formatPrimaryShortcut('S')
  const commandPaletteShortcut = formatPrimaryShortcut('P', { shift: true })
  const sidebarShortcut = formatPrimaryShortcut('\\')

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && key === 'n') {
        event.preventDefault()
        newFile()
      }
      if (mod && key === 'o') {
        event.preventDefault()
        void openFile()
      }
      if (mod && event.shiftKey && key === 's') {
        event.preventDefault()
        void saveFileAs()
      }
      if (mod && !event.shiftKey && key === 's') {
        event.preventDefault()
        void saveFile()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [newFile, openFile, saveFile, saveFileAs])

  const headingItems: ToolbarMenuItem[] = [
    { id: 'h1', label: t('toolbar.h1'), textIcon: 'H1', action: () => emitFormat('h1') },
    { id: 'h2', label: t('toolbar.h2'), textIcon: 'H2', action: () => emitFormat('h2') },
    { id: 'h3', label: t('toolbar.h3'), textIcon: 'H3', action: () => emitFormat('h3') },
    { id: 'h4', label: t('toolbar.h4'), textIcon: 'H4', action: () => emitFormat('h4') },
    { id: 'h5', label: t('toolbar.h5'), textIcon: 'H5', action: () => emitFormat('h5') },
    { id: 'h6', label: t('toolbar.h6'), textIcon: 'H6', action: () => emitFormat('h6') },
  ]

  const moreActionItems: ToolbarMenuItem[] = [
    { id: 'link', label: t('toolbar.link'), icon: 'link', action: () => emitFormat('link') },
    { id: 'code', label: t('toolbar.code'), icon: 'code', action: () => emitFormat('code') },
    { id: 'codeblock', label: t('toolbar.codeBlock'), icon: 'codeBlock', action: () => emitFormat('codeblock') },
    { id: 'table', label: t('toolbar.table'), icon: 'table', action: () => emitFormat('table') },
    { id: 'hr', label: t('toolbar.hr'), icon: 'hr', action: () => emitFormat('hr') },
    { id: 'image', label: t('toolbar.image'), icon: 'image', action: () => emitFormat('image') },
  ]

  return (
    <div
      className="relative flex min-w-max flex-shrink-0 items-center gap-1.5 rounded-[1.25rem] px-3.5 transition-all duration-300 glass-panel"
      style={{
        height: '46px',
        boxShadow: 'var(--shadow-elegant)',
      }}
    >
      <ToolbarBtn
        title={`${t('toolbar.toggleSidebar')} (${sidebarShortcut})`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        active={sidebarOpen}
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
          >
            <AppIcon name="download" size={16} />
          </ToolbarBtn>
          {showExport && <ExportMenu onClose={() => setShowExport(false)} triggerRef={exportButtonRef} />}
        </div>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.structure')}>
        <div className="relative">
          <ToolbarBtn
            title={t('toolbar.headings')}
            buttonRef={headingButtonRef}
            onClick={() => setShowHeadings((open) => !open)}
            active={showHeadings}
            variant="wide"
          >
            <ToolbarTextMark label="H" />
            <AppIcon name="chevronDown" size={14} />
          </ToolbarBtn>
          {showHeadings && <ToolbarMenu items={headingItems} onClose={() => setShowHeadings(false)} triggerRef={headingButtonRef} width={176} />}
        </div>

        <ToolbarBtn title={t('toolbar.quote')} onClick={() => emitFormat('quote')}>
          <AppIcon name="quote" size={16} />
        </ToolbarBtn>
        <ToolbarBtn title={t('toolbar.ul')} onClick={() => emitFormat('ul')}>
          <AppIcon name="list" size={16} />
        </ToolbarBtn>
        <ToolbarBtn title={t('toolbar.ol')} onClick={() => emitFormat('ol')}>
          <AppIcon name="orderedList" size={16} />
        </ToolbarBtn>
        <ToolbarBtn title={t('toolbar.task')} onClick={() => emitFormat('task')}>
          <AppIcon name="task" size={16} />
        </ToolbarBtn>
      </ToolbarGroup>

      <ToolbarGroup label={t('toolbar.inline')}>
        <ToolbarBtn title={t('toolbar.bold')} onClick={() => emitFormat('bold')}>
          <AppIcon name="bold" size={16} />
        </ToolbarBtn>
        <ToolbarBtn title={t('toolbar.italic')} onClick={() => emitFormat('italic')}>
          <AppIcon name="italic" size={16} />
        </ToolbarBtn>
        <ToolbarBtn title={t('toolbar.underline')} onClick={() => emitFormat('underline')}>
          <AppIcon name="underline" size={16} />
        </ToolbarBtn>
        <ToolbarBtn title={t('toolbar.strikethrough')} onClick={() => emitFormat('strikethrough')}>
          <AppIcon name="strikethrough" size={16} />
        </ToolbarBtn>
        <ToolbarBtn title={t('toolbar.highlight')} onClick={() => emitFormat('highlight')}>
          <AppIcon name="highlight" size={16} />
        </ToolbarBtn>

        <div className="relative">
          <ToolbarBtn
            title={t('toolbar.moreActions')}
            buttonRef={moreActionsButtonRef}
            onClick={() => setShowMoreActions((open) => !open)}
            active={showMoreActions}
          >
            <AppIcon name="more" size={16} />
          </ToolbarBtn>
          {showMoreActions && (
            <ToolbarMenu
              items={moreActionItems}
              onClose={() => setShowMoreActions(false)}
              triggerRef={moreActionsButtonRef}
              width={220}
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
        title={wysiwygMode ? t('toolbar.disableWysiwyg') : t('toolbar.enableWysiwyg')}
        onClick={() => setWysiwygMode(!wysiwygMode)}
        active={wysiwygMode}
      >
        <AppIcon name="wysiwyg" size={16} />
      </ToolbarBtn>

      <ToolbarBtn title={t('toolbar.focusMode')} onClick={() => setFocusMode(!focusMode)} active={focusMode}>
        <span data-toolbar-action="focus-mode" className="contents">
        <AppIcon name="focus" size={16} />
        </span>
      </ToolbarBtn>

      <ToolbarGroup label={t('toolbar.viewMode')}>
        {VIEW_MODES.map(({ mode, icon }) => (
          <ToolbarBtn key={mode} title={t(`viewMode.${mode}`)} onClick={() => setViewMode(mode)} active={viewMode === mode}>
            <span data-view-mode={mode} className="contents">
            <AppIcon name={icon} size={15} />
            </span>
          </ToolbarBtn>
        ))}
      </ToolbarGroup>

      <ToolbarBtn title={`${t('toolbar.commandPalette')} (${commandPaletteShortcut})`} onClick={() => onOpenPalette?.()}>
        <span data-toolbar-action="command-palette" className="contents">
        <AppIcon name="keyboard" size={16} />
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
            setShowAbout(false)
          }}
          active={showTheme}
        >
          <span data-toolbar-action="settings" className="contents">
          <AppIcon name="settings" size={16} />
          </span>
        </ToolbarBtn>
        {showTheme && <ThemePanel onClose={() => setShowTheme(false)} triggerRef={themeButtonRef} />}
      </div>

      <div className="relative">
        <ToolbarBtn
          title={t('toolbar.about')}
          buttonRef={aboutButtonRef}
          onClick={() => {
            setShowAbout((open) => !open)
            setShowTheme(false)
          }}
          active={showAbout}
        >
          <span data-toolbar-action="about" className="contents">
          <AppIcon name="infoCircle" size={16} />
          </span>
        </ToolbarBtn>
        {showAbout && <AboutPanel onClose={() => setShowAbout(false)} triggerRef={aboutButtonRef} />}
      </div>
    </div>
  )
}
