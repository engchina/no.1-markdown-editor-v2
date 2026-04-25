import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../store/editor'
import AppIcon from '../Icons/AppIcon'
import { SIDEBAR_SURFACES } from './surfaces'
import { SidebarSectionSurface } from './sidebarShared'

interface Props {
  width: number
}

export default function Sidebar({ width }: Props) {
  const { t } = useTranslation()
  const { sidebarTab, setSidebarTab } = useEditorStore()
  const activeSurface = SIDEBAR_SURFACES.find((surface) => surface.id === sidebarTab) ?? SIDEBAR_SURFACES[0]
  const ActivePanel = activeSurface.component

  return (
    <div
      className="sidebar-surface flex h-full min-h-0 flex-shrink-0 flex-col"
      style={{ width }}
    >
      <div className="flex flex-shrink-0 items-center px-3 pb-2 pt-3">
        <div
          className="flex w-full items-center p-1 rounded-[14px]"
          style={{
            background: 'color-mix(in srgb, var(--bg-secondary) 92%, transparent)',
            border: '1px solid color-mix(in srgb, var(--border) 72%, transparent)',
          }}
        >
          {SIDEBAR_SURFACES.map((surface) => {
            const title = t(surface.titleKey)
            const selected = sidebarTab === surface.id

            return (
              <button
                key={surface.id}
                title={title}
                aria-label={title}
                data-sidebar-tab={surface.id}
                onClick={() => setSidebarTab(surface.id)}
                className="flex-1 h-8 rounded-[10px] flex items-center justify-center text-sm transition-all duration-300 ease-out"
                style={{
                  color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: selected ? 'var(--bg-primary)' : 'transparent',
                  boxShadow: selected ? '0 8px 20px -16px rgba(15, 23, 42, 0.32)' : 'none',
                  fontWeight: selected ? 500 : 400,
                }}
              >
                <AppIcon name={surface.icon} size={15} />
              </button>
            )
          })}
        </div>
      </div>

      <div className="sidebar-surface__scroll flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        <SidebarSectionSurface className={activeSurface.surfaceClassName ?? 'px-3 py-3'}>
          <ActivePanel />
        </SidebarSectionSurface>
      </div>
    </div>
  )
}
