import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore, useActiveTab, type SidebarTab } from '../../store/editor'

interface Props {
  width: number
}

interface Heading {
  level: number
  text: string
  id: string
}

function extractHeadings(markdown: string): Heading[] {
  const lines = markdown.split('\n')
  const headings: Heading[] = []
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        id: match[2].trim().toLowerCase().replace(/[^a-z0-9\u3040-\u9fff]+/gi, '-'),
      })
    }
  }
  return headings
}

const TABS: { id: SidebarTab; icon: string }[] = [
  { id: 'outline', icon: '≡' },
  { id: 'files', icon: '📁' },
  { id: 'search', icon: '🔍' },
]

export default function Sidebar({ width }: Props) {
  const { t } = useTranslation()
  const { sidebarTab, setSidebarTab } = useEditorStore()
  const activeTab = useActiveTab()
  const headings = useMemo(
    () => extractHeadings(activeTab?.content ?? ''),
    [activeTab?.content]
  )

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        width,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Tab icons */}
      <div
        className="flex items-center"
        style={{ borderBottom: '1px solid var(--border)', height: '36px' }}
      >
        {TABS.map(({ id, icon }) => (
          <button
            key={id}
            title={t(`sidebar.${id}`)}
            onClick={() => setSidebarTab(id)}
            className="flex-1 h-full text-sm transition-colors"
            style={{
              color: sidebarTab === id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: sidebarTab === id ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {sidebarTab === 'outline' && (
          <OutlinePanel headings={headings} />
        )}
        {sidebarTab === 'files' && (
          <FilesPanel />
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
  if (headings.length === 0) {
    return (
      <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
        {t('sidebar.noOutline')}
      </p>
    )
  }
  return (
    <ul className="space-y-0.5">
      {headings.map((h, i) => (
        <li
          key={i}
          className="flex items-center rounded px-2 py-1 cursor-pointer text-xs transition-colors hover:bg-opacity-50"
          style={{
            paddingLeft: `${(h.level - 1) * 12 + 8}px`,
            color: h.level === 1 ? 'var(--text-primary)' : h.level === 2 ? 'var(--text-secondary)' : 'var(--text-muted)',
            fontWeight: h.level <= 2 ? 500 : 400,
          }}
          onClick={() => {
            // Scroll preview to heading
            const el = document.getElementById(h.id)
            el?.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          <span
            className="mr-1 text-xs"
            style={{ color: 'var(--text-muted)', minWidth: '20px', fontFamily: 'monospace' }}
          >
            {'H' + h.level}
          </span>
          <span className="truncate">{h.text}</span>
        </li>
      ))}
    </ul>
  )
}

function FilesPanel() {
  const { tabs, activeTabId, setActiveTab, addTab } = useEditorStore()

  return (
    <div>
      <ul className="space-y-0.5">
        {tabs.map((tab) => (
          <li
            key={tab.id}
            className="flex items-center rounded px-2 py-1 cursor-pointer text-xs transition-colors"
            style={{
              background: tab.id === activeTabId ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
              color: tab.id === activeTabId ? 'var(--accent)' : 'var(--text-secondary)',
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="mr-1">📄</span>
            <span className="truncate">{tab.isDirty ? '● ' : ''}{tab.name}</span>
          </li>
        ))}
      </ul>
      <button
        className="mt-3 w-full text-xs py-1 rounded transition-colors"
        style={{
          border: '1px dashed var(--border)',
          color: 'var(--text-muted)',
        }}
        onClick={() => addTab()}
      >
        + New
      </button>
    </div>
  )
}

function SearchPanel() {
  return (
    <div>
      <input
        type="text"
        placeholder="Search..."
        className="w-full rounded px-2 py-1 text-xs outline-none"
        style={{
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
      />
      <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
        Search coming soon
      </p>
    </div>
  )
}
