import { useTranslation } from 'react-i18next'
import { useFileOps } from '../../hooks/useFileOps'
import { useEditorStore } from '../../store/editor'

export default function DocumentTabs() {
  const { t } = useTranslation()
  const tabs = useEditorStore((state) => state.tabs)
  const activeTabId = useEditorStore((state) => state.activeTabId)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const { closeTabById } = useFileOps()

  if (tabs.length === 0) return null

  return (
    <div
      role="tablist"
      aria-label={t('menu.file')}
      className="flex min-w-0 flex-shrink-0 items-end overflow-x-auto overflow-y-hidden px-3"
      style={{
        minHeight: '40px',
        background: 'color-mix(in srgb, var(--bg-secondary) 92%, transparent)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId

        return (
          <div
            key={tab.id}
            className="group -mb-px mt-2 flex h-8 max-w-[220px] flex-shrink-0 items-center rounded-t-[14px] border border-b-0 transition-colors"
            style={{
              background: isActive ? 'var(--bg-primary)' : 'transparent',
              borderColor: isActive ? 'var(--border)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              title={tab.path ?? tab.name}
              className="flex h-full min-w-0 items-center gap-2 px-3 text-left"
              onClick={() => setActiveTab(tab.id)}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{
                  background: tab.isDirty ? 'var(--accent)' : 'color-mix(in srgb, var(--text-muted) 22%, transparent)',
                }}
              />
              <span className="truncate text-[13px]">{tab.name}</span>
            </button>

            <button
              type="button"
              className="mr-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100"
              title={`${t('menu.closeFile')}: ${tab.name}`}
              aria-label={`${t('menu.closeFile')}: ${tab.name}`}
              style={{ lineHeight: 1, fontSize: '16px' }}
              onClick={(event) => {
                event.stopPropagation()
                void closeTabById(tab.id)
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'color-mix(in srgb, var(--bg-tertiary) 78%, transparent)'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent'
              }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
