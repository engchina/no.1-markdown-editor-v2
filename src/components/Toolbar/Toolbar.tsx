import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore, type ViewMode } from '../../store/editor'
import { LANGUAGES, type Language } from '../../i18n'
import { useFileOps } from '../../hooks/useFileOps'
import { useExport } from '../../hooks/useExport'
import { applyTheme, getThemeById } from '../../themes'
import ThemePanel from '../ThemePanel/ThemePanel'

// SVG icon helper
const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const icons = {
  new: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  open: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
  bold: 'M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z',
  italic: 'M19 4h-9M14 20H5M14.7 4.7L9.2 19.4',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  image: 'M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2z M8.5 13.5l2.5-3 2 2.5 2.5-3L19 15',
  code: 'M16 18l6-6-6-6 M8 6l-6 6 6 6',
  quote: 'M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  table: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sidebar: 'M3 3h18v18H3zM9 3v18',
  focus: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
  palette: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z M12 8v4 M12 16h.01',
  wysiwyg: 'M4 6h16M4 12h10M4 18h7',
  export: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
}

interface ToolbarBtnProps {
  title: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
  disabled?: boolean
}

function ToolbarBtn({ title, onClick, active, children, disabled }: ToolbarBtnProps) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40"
      style={{
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px mx-1 self-stretch" style={{ background: 'var(--border)' }} />
}

const VIEW_MODES: { mode: ViewMode; icon: string; title: string }[] = [
  { mode: 'source', icon: '⌨', title: 'Source' },
  { mode: 'split', icon: '⬛', title: 'Split' },
  { mode: 'preview', icon: '👁', title: 'Preview' },
]

function ExportMenu({ onClose }: { onClose: () => void }) {
  const { exportHtml, exportPdf, exportMarkdown } = useExport()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const items = [
    { label: 'Export as HTML', icon: '🌐', action: exportHtml },
    { label: 'Export as PDF', icon: '📄', action: exportPdf },
    { label: 'Export Markdown', icon: '📝', action: exportMarkdown },
  ]

  return (
    <div
      ref={ref}
      className="absolute right-2 top-12 z-50 rounded-lg shadow-xl overflow-hidden animate-in"
      style={{
        width: '200px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
      }}
    >
      {items.map(({ label, icon, action }) => (
        <button
          key={label}
          onClick={() => { action(); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
          style={{ color: 'var(--text-primary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span>{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

export default function Toolbar() {
  const { t } = useTranslation()
  const {
    viewMode, setViewMode,
    sidebarOpen, setSidebarOpen,
    focusMode, setFocusMode,
    wysiwygMode, setWysiwygMode,
    language, setLanguage,
    tabs, activeTabId,
    activeThemeId,
  } = useEditorStore()

  const { newFile, openFile, saveFile } = useFileOps()
  const [showExport, setShowExport] = useState(false)
  const [showTheme, setShowTheme] = useState(false)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  // Apply stored theme on mount
  useEffect(() => {
    applyTheme(getThemeById(activeThemeId))
  }, [activeThemeId])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'n') { e.preventDefault(); newFile() }
      if (mod && e.key === 'o') { e.preventDefault(); openFile() }
      if (mod && e.key === 's') { e.preventDefault(); saveFile() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [newFile, openFile, saveFile])

  return (
    <div
      className="relative flex items-center px-3 gap-1 flex-shrink-0"
      style={{
        height: '44px',
        background: 'var(--toolbar-bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* File ops */}
      <ToolbarBtn title={`${t('toolbar.new')} (Ctrl+N)`} onClick={newFile}>
        <Icon d={icons.new} />
      </ToolbarBtn>
      <ToolbarBtn title={`${t('toolbar.open')} (Ctrl+O)`} onClick={openFile}>
        <Icon d={icons.open} />
      </ToolbarBtn>
      <ToolbarBtn title={`${t('toolbar.save')} (Ctrl+S)`} onClick={saveFile}>
        <Icon d={icons.save} />
      </ToolbarBtn>

      <Divider />

      {/* Format ops */}
      <ToolbarBtn title={t('toolbar.bold')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'bold' }))}>
        <Icon d={icons.bold} />
      </ToolbarBtn>
      <ToolbarBtn title={t('toolbar.italic')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'italic' }))}>
        <Icon d={icons.italic} />
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn title={t('toolbar.h1')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'h1' }))}>
        <span className="text-xs font-bold" style={{ fontFamily: 'monospace' }}>H1</span>
      </ToolbarBtn>
      <ToolbarBtn title={t('toolbar.h2')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'h2' }))}>
        <span className="text-xs font-bold" style={{ fontFamily: 'monospace' }}>H2</span>
      </ToolbarBtn>
      <ToolbarBtn title={t('toolbar.h3')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'h3' }))}>
        <span className="text-xs font-bold" style={{ fontFamily: 'monospace' }}>H3</span>
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn title={t('toolbar.link')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'link' }))}>
        <Icon d={icons.link} />
      </ToolbarBtn>
      <ToolbarBtn title={t('toolbar.image')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'image' }))}>
        <Icon d={icons.image} />
      </ToolbarBtn>
      <ToolbarBtn title={t('toolbar.code')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'code' }))}>
        <Icon d={icons.code} />
      </ToolbarBtn>
      <ToolbarBtn title={t('toolbar.quote')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'quote' }))}>
        <Icon d={icons.quote} />
      </ToolbarBtn>
      <ToolbarBtn title={t('toolbar.ul')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'ul' }))}>
        <Icon d={icons.list} />
      </ToolbarBtn>
      <ToolbarBtn title={t('toolbar.table')} onClick={() => document.dispatchEvent(new CustomEvent('editor:format', { detail: 'table' }))}>
        <Icon d={icons.table} />
      </ToolbarBtn>

      {/* WYSIWYG toggle */}
      <Divider />
      <ToolbarBtn
        title={`WYSIWYG Live Preview${wysiwygMode ? ' (ON)' : ''}`}
        onClick={() => setWysiwygMode(!wysiwygMode)}
        active={wysiwygMode}
      >
        <Icon d={icons.wysiwyg} />
      </ToolbarBtn>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Title */}
      {activeTab && (
        <span className="text-sm truncate max-w-xs" style={{ color: 'var(--text-secondary)' }}>
          {activeTab.isDirty ? '● ' : ''}{activeTab.name}
        </span>
      )}

      <div className="flex-1" />

      {/* Export */}
      <div className="relative">
        <ToolbarBtn title="Export" onClick={() => { setShowExport(!showExport); setShowTheme(false) }}>
          <Icon d={icons.export} />
        </ToolbarBtn>
        {showExport && <ExportMenu onClose={() => setShowExport(false)} />}
      </div>

      {/* View mode */}
      <div
        className="flex items-center rounded overflow-hidden mx-1"
        style={{ border: '1px solid var(--border)', height: '28px' }}
      >
        {VIEW_MODES.map(({ mode, icon, title }) => (
          <button
            key={mode}
            title={title}
            onClick={() => setViewMode(mode)}
            className="px-2 h-full text-xs transition-colors"
            style={{
              background: viewMode === mode ? 'var(--accent)' : 'var(--bg-secondary)',
              color: viewMode === mode ? 'white' : 'var(--text-muted)',
              borderRight: mode !== 'preview' ? '1px solid var(--border)' : 'none',
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      <Divider />

      {/* Language selector */}
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="text-xs rounded px-1 py-0.5 cursor-pointer outline-none"
        style={{
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
          height: '28px',
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeLabel}
          </option>
        ))}
      </select>

      {/* Theme panel */}
      <div className="relative">
        <ToolbarBtn
          title="Appearance"
          onClick={() => { setShowTheme(!showTheme); setShowExport(false) }}
          active={showTheme}
        >
          <Icon d={icons.palette} />
        </ToolbarBtn>
        {showTheme && <ThemePanel onClose={() => setShowTheme(false)} />}
      </div>

      {/* Focus mode */}
      <ToolbarBtn title={t('toolbar.focusMode')} onClick={() => setFocusMode(!focusMode)} active={focusMode}>
        <Icon d={icons.focus} />
      </ToolbarBtn>

      {/* Sidebar toggle */}
      <ToolbarBtn title={t('toolbar.toggleSidebar')} onClick={() => setSidebarOpen(!sidebarOpen)} active={sidebarOpen}>
        <Icon d={icons.sidebar} />
      </ToolbarBtn>
    </div>
  )
}
