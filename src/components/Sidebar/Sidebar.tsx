import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore, useActiveTab, type SidebarTab } from '../../store/editor'
import { useRecentFiles } from '../../hooks/useRecentFiles'
import { extractHeadings, type OutlineHeading as Heading } from '../../lib/outline'
import AppIcon, { type IconName } from '../Icons/AppIcon'
import FileTree from './FileTree'

interface Props {
  width: number
}

export default function Sidebar({ width }: Props) {
  const { t } = useTranslation()
  const { sidebarTab, setSidebarTab } = useEditorStore()
  const activeTab = useActiveTab()
  const headings = useMemo(
    () => extractHeadings(activeTab?.content ?? ''),
    [activeTab?.content]
  )
  const tabs: { id: SidebarTab; icon: IconName; title: string }[] = [
    { id: 'outline', icon: 'outline', title: t('sidebar.outline') },
    { id: 'files', icon: 'folder', title: t('sidebar.files') },
    { id: 'recent', icon: 'clock', title: t('menu.recentFiles') },
    { id: 'search', icon: 'search', title: t('sidebar.search') },
  ]

  return (
    <div
      className="flex flex-col flex-shrink-0 h-full"
      style={{
        width,
        background: 'transparent',
      }}
    >
      {/* Tab Pill Navigation */}
      <div
        className="flex items-center mx-1 mb-3 p-1 rounded-[14px]"
        style={{ background: 'color-mix(in srgb, var(--border) 30%, transparent)', border: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}
      >
        {tabs.map(({ id, icon, title }) => (
          <button
            key={id}
            title={title}
            aria-label={title}
            onClick={() => setSidebarTab(id)}
            className="flex-1 h-8 rounded-[10px] flex items-center justify-center text-sm transition-all duration-300 ease-out"
            style={{
              color: sidebarTab === id ? 'var(--text-primary)' : 'var(--text-muted)',
              background: sidebarTab === id ? 'var(--bg-primary)' : 'transparent',
              boxShadow: sidebarTab === id ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              fontWeight: sidebarTab === id ? 500 : 400
            }}
          >
            <AppIcon name={icon} size={15} />
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 pt-0">
        {sidebarTab === 'outline' && (
          <OutlinePanel headings={headings} />
        )}
        {sidebarTab === 'files' && (
          <div className="bg-[var(--bg-sidebar)] rounded-xl border-[color:var(--border)] border overflow-hidden p-2">
            <FileTree />
          </div>
        )}
        {sidebarTab === 'recent' && (
          <RecentPanel />
        )}
        {sidebarTab === 'search' && (
          <SearchPanel />
        )}
      </div>
    </div>
  )
}

function OutlinePanel({ headings }: { headings: Heading[] }) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string>('')

  // Listen for scrollspy events from the preview panel
  useEffect(() => {
    const handler = (e: Event) => {
      setActiveId((e as CustomEvent<string>).detail)
    }
    document.addEventListener('preview:activeHeading', handler)
    return () => document.removeEventListener('preview:activeHeading', handler)
  }, [])

  if (headings.length === 0) {
    return (
      <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
        {t('sidebar.noOutline')}
      </p>
    )
  }
  return (
    <ul className="space-y-0.5">
      {headings.map((h, i) => {
        const isActive = activeId === h.id
        return (
          <li
            key={i}
            className="flex items-center rounded-lg px-2 py-1 cursor-pointer text-xs transition-all hover-scale"
            style={{
              paddingLeft: `${(h.level - 1) * 12 + 8}px`,
              color: isActive ? 'var(--accent)' : h.level === 1 ? 'var(--text-primary)' : h.level === 2 ? 'var(--text-secondary)' : 'var(--text-muted)',
              fontWeight: h.level <= 2 ? 500 : 400,
              background: isActive ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            }}
            onClick={() => {
              // Scroll preview panel to heading using rehype-slug generated IDs
              const preview = document.querySelector('.markdown-preview')
              const el = preview?.querySelector(`#${CSS.escape(h.id)}`) ?? document.getElementById(h.id)
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                el.animate([{ background: 'color-mix(in srgb, var(--accent) 20%, transparent)' }, { background: 'transparent' }], { duration: 1200 })
              }
            }}
          >
            <span
              className="mr-1 text-xs"
              style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', minWidth: '20px', fontFamily: 'monospace' }}
            >
              {'H' + h.level}
            </span>
            <span className="truncate">{h.text}</span>
          </li>
        )
      })}
    </ul>
  )
}


function SearchPanel() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const { tabs, setActiveTab, setPendingNavigation } = useEditorStore()

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const hits: { tabId: string; name: string; line: number; column: number; text: string }[] = []
    for (const tab of tabs) {
      const lines = tab.content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const column = lines[i].toLowerCase().indexOf(q)
        if (column !== -1) {
          hits.push({
            tabId: tab.id,
            name: tab.name,
            line: i + 1,
            column: column + 1,
            text: lines[i].trim(),
          })
          if (hits.length >= 100) break
        }
      }
      if (hits.length >= 100) break
    }
    return hits
  }, [query, tabs])

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('sidebar.searchOpenTabs')}
        className="w-full rounded px-2 py-1 text-xs outline-none"
        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
      />
      {query && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {results.length === 0 ? t('sidebar.noResults') : t('sidebar.results', { count: results.length })}
        </p>
      )}
      <ul className="space-y-0.5">
        {results.map((r, i) => (
          <li
            key={i}
            className="rounded px-2 py-1 cursor-pointer text-xs transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => {
              setActiveTab(r.tabId)
              setPendingNavigation({ tabId: r.tabId, line: r.line, column: r.column })
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{r.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>:{r.line}</span>
            </div>
            <div className="truncate" style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '10px' }}>
              {r.text.slice(0, 80)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RecentPanel() {
  const { t } = useTranslation()
  const { recentFiles, openRecent, clearRecent, canReopenRecent } = useRecentFiles()

  function relativeTime(ts: number): string {
    const diff = Date.now() - ts
    const secs = Math.floor(diff / 1000)
    if (secs < 60) return t('sidebar.justNow')
    const mins = Math.floor(secs / 60)
    if (mins < 60) return t('sidebar.minutesAgo', { count: mins })
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return t('sidebar.hoursAgo', { count: hrs })
    const days = Math.floor(hrs / 24)
    return t('sidebar.daysAgo', { count: days })
  }

  if (recentFiles.length === 0) {
    return (
      <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
        {t('sidebar.noRecent')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('sidebar.recentFilesTitle')}</span>
        <button
          className="text-xs transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onClick={clearRecent}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          {t('sidebar.clear')}
        </button>
      </div>
      {!canReopenRecent && (
        <div
          className="mb-2 rounded-xl border px-3 py-2 text-[11px]"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
            background: 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
            color: 'var(--text-muted)',
          }}
        >
          {t('notices.recentFileBrowserMessage')}
        </div>
      )}
      <ul className="space-y-0.5">
        {recentFiles.map((f, i) => (
          <li
            key={i}
            className={`rounded-xl px-3 py-2 text-xs transition-all duration-200 group border border-transparent ${canReopenRecent ? 'cursor-pointer' : 'cursor-help'}`}
            onClick={() => { void openRecent(f) }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--border) 50%, transparent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}
            title={f.path}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{f.name}</span>
              <span className="flex-shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>{relativeTime(f.openedAt)}</span>
            </div>
            <div className="truncate mt-0.5" style={{ color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'monospace' }}>
              {f.path}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
