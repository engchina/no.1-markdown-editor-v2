import { type ReactNode } from 'react'
import { openDesktopDocumentPath } from '../../lib/desktopFileOpen'
import { dispatchEditorReturnToWriting } from '../../lib/editorFocus.ts'
import { useActiveTab, useEditorStore } from '../../store/editor'
import AppIcon from '../Icons/AppIcon'

export function SidebarSectionSurface({
  children,
  className = 'px-3 py-3',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
        border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
        borderRadius: '20px',
      }}
    >
      {children}
    </div>
  )
}

export function SidebarPanelHeading({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string
  detail?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
          {title}
        </div>
        {detail && (
          <div className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
            {detail}
          </div>
        )}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
          style={{
            borderColor: 'color-mix(in srgb, var(--accent) 32%, var(--border))',
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          <span className="flex items-center gap-1.5">
            <AppIcon name="edit" size={12} />
            <span>{actionLabel}</span>
          </span>
        </button>
      )}
    </div>
  )
}

export function SidebarMetricTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'success'
}) {
  const color =
    tone === 'accent'
      ? 'var(--accent)'
      : tone === 'warning'
        ? '#b45309'
        : tone === 'danger'
          ? '#b91c1c'
          : tone === 'success'
            ? '#15803d'
            : 'var(--text-primary)'

  return (
    <div
      className="rounded-2xl border px-3 py-3"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 86%, transparent)',
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-1 text-base font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

export function SidebarSubsectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}

export function SidebarStatusPill({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'warning' | 'danger' | 'success'
}) {
  const color =
    tone === 'warning'
      ? '#b45309'
      : tone === 'danger'
        ? '#b91c1c'
        : tone === 'success'
          ? '#15803d'
          : 'var(--text-muted)'

  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
        color,
      }}
    >
      {label}
    </span>
  )
}

export function SidebarEmptyState({
  title,
  detail,
}: {
  title: string
  detail?: string
}) {
  return (
    <div
      className="rounded-2xl border px-3 py-4 text-center"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 86%, transparent)',
      }}
    >
      <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
        {title}
      </div>
      {detail && (
        <div className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
          {detail}
        </div>
      )}
    </div>
  )
}

export function SidebarFilterGroup({
  items,
}: {
  items: Array<{
    id: string
    label: string
    active: boolean
    count?: number
    onClick: () => void
  }>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
          aria-pressed={item.active}
          style={{
            borderColor: item.active
              ? 'color-mix(in srgb, var(--accent) 42%, var(--border))'
              : 'color-mix(in srgb, var(--border) 72%, transparent)',
            background: item.active
              ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
              : 'color-mix(in srgb, var(--bg-primary) 86%, transparent)',
            color: item.active ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
        >
          {item.label}
          {typeof item.count === 'number' ? ` · ${item.count}` : ''}
        </button>
      ))}
    </div>
  )
}

export function SidebarIssueBanner({
  message,
  tone = 'warning',
}: {
  message: string
  tone?: 'warning' | 'danger'
}) {
  const color = tone === 'danger' ? '#b91c1c' : '#b45309'

  return (
    <div
      role="alert"
      className="rounded-2xl border px-3 py-2 text-[11px] leading-5"
      style={{
        borderColor: `color-mix(in srgb, ${color} 30%, var(--border))`,
        background: `color-mix(in srgb, ${color} 8%, var(--bg-primary))`,
        color,
      }}
    >
      {message}
    </div>
  )
}

export function useSidebarDocumentNavigation() {
  const activeTab = useActiveTab()
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const setPendingNavigation = useEditorStore((state) => state.setPendingNavigation)
  const setSidebarOpen = useEditorStore((state) => state.setSidebarOpen)

  async function openDocumentLocation(
    path: string,
    line = 1,
    column = 1,
    options?: { returnToWriting?: boolean }
  ): Promise<boolean> {
    if (!path) return false

    if (activeTab?.path === path) {
      setPendingNavigation({
        tabId: activeTab.id,
        line,
        column,
        align: 'start',
      })
      if (options?.returnToWriting) setSidebarOpen(false)
      return true
    }

    const existing = useEditorStore.getState().tabs.find((tab) => tab.path === path)
    if (existing) {
      setActiveTab(existing.id)
      setPendingNavigation({
        tabId: existing.id,
        line,
        column,
        align: 'start',
      })
      if (options?.returnToWriting) setSidebarOpen(false)
      return true
    }

    const opened = await openDesktopDocumentPath(path)
    if (!opened) return false

    const openedTab = useEditorStore.getState().tabs.find((tab) => tab.path === path)
    if (!openedTab) return false

    setActiveTab(openedTab.id)
    setPendingNavigation({
      tabId: openedTab.id,
      line,
      column,
      align: 'start',
    })
    if (options?.returnToWriting) setSidebarOpen(false)
    return true
  }

  function focusActiveDocumentLine(
    line: number,
    column = 1,
    options?: { returnToWriting?: boolean }
  ): boolean {
    if (!activeTab) return false

    setPendingNavigation({
      tabId: activeTab.id,
      line,
      column,
      align: 'start',
    })
    if (options?.returnToWriting) setSidebarOpen(false)
    return true
  }

  function returnToWriting(): boolean {
    setSidebarOpen(false)
    return dispatchEditorReturnToWriting()
  }

  return {
    openDocumentLocation,
    focusActiveDocumentLine,
    returnToWriting,
  }
}
