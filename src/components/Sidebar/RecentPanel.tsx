import { useTranslation } from 'react-i18next'
import { useRecentFiles } from '../../hooks/useRecentFiles'
import { SidebarEmptyState } from './sidebarShared'

export default function RecentPanel() {
  const { t } = useTranslation()
  const { recentFiles, openRecent, clearRecent, canReopenRecent } = useRecentFiles()

  function relativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp
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
    return <SidebarEmptyState title={t('sidebar.noRecent')} />
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('sidebar.recentFilesTitle')}</span>
        <button
          type="button"
          className="text-xs transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onClick={clearRecent}
          onMouseEnter={(event) => (event.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={(event) => (event.currentTarget.style.color = 'var(--text-muted)')}
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
        {recentFiles.map((file, index) => (
          <li key={index}>
            <button
              type="button"
              className={`group w-full rounded-xl border border-transparent px-3 py-2 text-left text-xs transition-all duration-200 ${canReopenRecent ? 'cursor-pointer' : 'cursor-help'}`}
              onClick={() => {
                void openRecent(file)
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'var(--bg-tertiary)'
                event.currentTarget.style.borderColor = 'color-mix(in srgb, var(--border) 50%, transparent)'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent'
                event.currentTarget.style.borderColor = 'transparent'
              }}
              title={file.path}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{file.name}</span>
                <span className="flex-shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>{relativeTime(file.openedAt)}</span>
              </div>
              <div className="mt-0.5 truncate" style={{ color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'monospace' }}>
                {file.path}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
