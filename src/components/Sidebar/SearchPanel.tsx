import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../store/editor'
import { useWorkspaceSearch } from '../../hooks/useWorkspaceSearch'
import { openDesktopDocumentPath } from '../../lib/desktopFileOpen'

export default function SearchPanel() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const { setActiveTab, setPendingNavigation } = useEditorStore()
  const { results, searching, rootPath } = useWorkspaceSearch(query)
  const searchScopeLabel = rootPath ? t('sidebar.searchWorkspace') : t('sidebar.searchOpenTabs')
  let lastSource: 'tab' | 'workspace' | '' = ''

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchScopeLabel}
        className="w-full rounded px-2 py-1 text-xs outline-none"
        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
      />
      {query && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {searching
            ? t('sidebar.searching')
            : results.length === 0
              ? t('sidebar.noResults')
              : t('sidebar.results', { count: results.length })}
        </p>
      )}
      <ul className="space-y-0.5">
        {results.map((result) => {
          const showHeader = result.source !== lastSource
          if (showHeader) lastSource = result.source

          return (
            <li key={result.id}>
              {showHeader && (
                <div
                  className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {result.source === 'tab' ? t('sidebar.searchSourceTabs') : t('sidebar.searchSourceWorkspace')}
                </div>
              )}
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left text-xs transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onClick={async () => {
                  if (result.tabId) {
                    setActiveTab(result.tabId)
                    setPendingNavigation({ tabId: result.tabId, line: result.line, column: result.column })
                    return
                  }

                  if (!result.path) return
                  const opened = await openDesktopDocumentPath(result.path)
                  if (!opened) return

                  const tab = useEditorStore.getState().tabs.find((entry) => entry.path === result.path)
                  if (!tab) return

                  setActiveTab(tab.id)
                  setPendingNavigation({ tabId: tab.id, line: result.line, column: result.column })
                }}
                onMouseEnter={(event) => (event.currentTarget.style.background = 'var(--bg-tertiary)')}
                onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
              >
                <div className="mb-0.5 flex items-center gap-1">
                  <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{result.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>:{result.line}</span>
                </div>
                <div className="truncate" style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '10px' }}>
                  {result.path ?? t('palette.unsaved')}
                </div>
                <div className="truncate" style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '10px' }}>
                  {result.text.slice(0, 80)}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
