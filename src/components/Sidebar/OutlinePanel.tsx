import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActiveTab, useEditorStore } from '../../store/editor'
import { extractHeadings } from '../../lib/outline'
import { flashPreviewTarget, resolvePreviewAnchorTarget, scrollPreviewToTarget } from '../../lib/previewNavigation'
import { SidebarEmptyState } from './sidebarShared'

export default function OutlinePanel() {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string>('')
  const activeTab = useActiveTab()
  const viewMode = useEditorStore((state) => state.viewMode)
  const setPendingNavigation = useEditorStore((state) => state.setPendingNavigation)
  const headings = useMemo(
    () => extractHeadings(activeTab?.content ?? ''),
    [activeTab?.content]
  )

  useEffect(() => {
    const handler = (event: Event) => {
      setActiveId((event as CustomEvent<string>).detail)
    }

    document.addEventListener('preview:activeHeading', handler)
    return () => document.removeEventListener('preview:activeHeading', handler)
  }, [])

  if (headings.length === 0) {
    return (
      <SidebarEmptyState
        title={t('sidebar.noOutline')}
      />
    )
  }

  return (
    <ul className="space-y-0.5">
      {headings.map((heading, index) => {
        const isActive = activeId === heading.id

        return (
          <li key={heading.id || index}>
            <button
              type="button"
              className="flex w-full items-center rounded-lg px-2 py-1 text-left text-xs transition-colors"
              style={{
                paddingLeft: `${(heading.level - 1) * 12 + 8}px`,
                color:
                  isActive
                    ? 'var(--accent)'
                    : heading.level === 1
                      ? 'var(--text-primary)'
                      : heading.level === 2
                        ? 'var(--text-secondary)'
                        : 'var(--text-muted)',
                fontWeight: heading.level <= 2 ? 500 : 400,
                background: isActive ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              aria-current={isActive ? 'location' : undefined}
              onClick={() => {
                setActiveId(heading.id)

                if (activeTab && viewMode !== 'preview') {
                  setPendingNavigation({
                    tabId: activeTab.id,
                    line: heading.line,
                    column: 1,
                    align: 'start',
                  })
                }

                const preview = document.querySelector('.markdown-preview')
                const previewElement = preview instanceof HTMLElement ? preview : null
                const element = previewElement && heading.id
                  ? resolvePreviewAnchorTarget(previewElement, heading.id)
                  : null
                if (previewElement && element) {
                  scrollPreviewToTarget(previewElement, element)
                  flashPreviewTarget(element)
                }
              }}
            >
              <span
                className="mr-1 text-xs"
                style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', minWidth: '20px', fontFamily: 'monospace' }}
              >
                {`H${heading.level}`}
              </span>
              <span className="truncate">{heading.text}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
