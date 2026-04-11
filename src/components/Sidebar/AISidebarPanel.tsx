import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { dispatchEditorAIOpen } from '../../lib/ai/events.ts'
import { normalizeAIDraftText } from '../../lib/ai/prompt.ts'
import { getAITemplateModels } from '../../lib/ai/templateLibrary.ts'
import { formatPrimaryShortcut } from '../../lib/platform.ts'
import { useAIStore } from '../../store/ai'
import { useEditorStore } from '../../store/editor'
import AppIcon, { type IconName } from '../Icons/AppIcon'
import {
  getAISidebarActions,
  getAISidebarStatus,
  type AISidebarPeekView,
  SIDEBAR_TAB_SOURCE,
} from './aiSidebarShared'

interface Props {
  activePeekView: AISidebarPeekView | null
  onPeekChange: (view: AISidebarPeekView | null) => void
}

export default function AISidebarPanel({ activePeekView, onPeekChange }: Props) {
  const { t } = useTranslation()
  const composer = useAIStore((state) => state.composer)
  const sidebarWidth = useEditorStore((state) => state.sidebarWidth)
  const compactLayout = sidebarWidth < 320
  const normalizedDraft = normalizeAIDraftText(composer.draftText, composer.outputTarget)
  const actions = useMemo(() => getAISidebarActions(t), [t])
  // 'ask' is only used for the Quick Action entry point, not shown in the Prompt Library
  const libraryTemplates = useMemo(
    () => getAITemplateModels(t).filter((tmpl) => tmpl.id !== 'ask'),
    [t]
  )
  const status = getAISidebarStatus({
    composerOpen: composer.open,
    draftText: normalizedDraft,
    errorMessage: composer.errorMessage,
    requestState: composer.requestState,
    maxDetailLength: compactLayout ? 96 : 132,
    t,
  })
  const shortcut = formatPrimaryShortcut('J')

  return (
    <div className="grid gap-3">
      <section
        className="rounded-[20px] border px-4 py-4"
        style={{
          borderColor: 'color-mix(in srgb, var(--accent) 18%, var(--border))',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--accent) 10%, var(--bg-primary)) 0%, color-mix(in srgb, var(--bg-secondary) 88%, transparent) 100%)',
          boxShadow: '0 14px 34px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div className={`flex gap-3 ${compactLayout ? 'flex-col' : 'items-start justify-between'}`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                <AppIcon name="sparkles" size={16} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {t('ai.sidebar.title')}
                </div>
                <p
                  className="mt-0.5 text-[11px] leading-4"
                  style={{
                    color: 'var(--text-muted)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {t('ai.sidebar.subtitle')}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            data-ai-sidebar-open-composer="true"
            onClick={() => {
              dispatchEditorAIOpen({ source: SIDEBAR_TAB_SOURCE })
              onPeekChange(null)
            }}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${compactLayout ? 'w-full justify-center' : 'shrink-0'}`}
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            <AppIcon name="sparkles" size={13} />
            <span>{t('ai.sidebar.openComposer')}</span>
          </button>
        </div>

        <div
          className="mt-4 rounded-[18px] border px-3 py-3"
          style={{ borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)' }}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('ai.sidebar.activeStatus')}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{
                background: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)',
                color: status.accent,
              }}
            >
              <AppIcon name={status.icon} size={13} />
              {status.label}
            </span>

            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                color: 'var(--text-muted)',
                background: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)',
              }}
            >
              {shortcut}
            </span>
          </div>

          <p
            className="mt-2 text-xs leading-5"
            style={{
              color: 'var(--text-secondary)',
              display: '-webkit-box',
              WebkitLineClamp: compactLayout ? 3 : 4,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
            title={status.detail}
          >
            {status.detail}
          </p>
        </div>

      </section>

      <AISectionShell>
        <div className="mb-3 flex items-center gap-2">
          <AppIcon name="panel" size={14} />
          <span className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.sidebar.quickActions')}
          </span>
        </div>

        <div className={`grid gap-2 ${sidebarWidth >= 340 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              data-ai-sidebar-action={action.id}
              onClick={() => {
                dispatchEditorAIOpen(action.openDetail)
                onPeekChange(null)
              }}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
                background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
              }}
              title={action.detail}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                <AppIcon name={action.icon} size={15} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {action.label}
                </span>
                <span className="mt-1 block truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {action.detail}
                </span>
              </span>
            </button>
          ))}
        </div>
      </AISectionShell>

      <AISectionShell>
        <div className="mb-3 flex items-center gap-2">
          <AppIcon name="outline" size={14} />
          <span className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.sidebar.peekSection')}
          </span>
        </div>

        <div className="grid gap-2">
          <AIPeekTrigger
            view="library"
            icon="copy"
            title={t('ai.sidebar.peekLibrary')}
            detail={t('ai.sidebar.peekLibraryDetail')}
            badge={String(libraryTemplates.length)}
            active={activePeekView === 'library'}
            onToggle={onPeekChange}
          />
          <AIPeekTrigger
            view="commands"
            icon="keyboard"
            title={t('ai.sidebar.peekCommands')}
            detail={t('ai.sidebar.peekCommandsDetail')}
            badge={shortcut}
            active={activePeekView === 'commands'}
            onToggle={onPeekChange}
          />
        </div>
      </AISectionShell>
    </div>
  )
}

function AISectionShell({ children }: { children: ReactNode }) {
  return (
    <section
      className="rounded-[18px] border px-4 py-4"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
        background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
      }}
    >
      {children}
    </section>
  )
}

function AIPeekTrigger({
  view,
  icon,
  title,
  detail,
  badge,
  active,
  onToggle,
}: {
  view: AISidebarPeekView
  icon: IconName
  title: string
  detail: string
  badge?: string
  active: boolean
  onToggle: (view: AISidebarPeekView | null) => void
}) {
  return (
    <button
      type="button"
      data-ai-sidebar-peek-trigger={view}
      onClick={() => onToggle(active ? null : view)}
      aria-expanded={active}
      aria-controls="ai-sidebar-peek-rail"
      aria-haspopup="dialog"
      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition-colors"
      style={{
        borderColor: active
          ? 'color-mix(in srgb, var(--accent) 26%, var(--border))'
          : 'color-mix(in srgb, var(--border) 78%, transparent)',
        background: active
          ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
          : 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
      }}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            color: 'var(--accent)',
          }}
        >
          <AppIcon name={icon} size={14} />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </span>
          <span className="mt-1 block text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
            {detail}
          </span>
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {badge && (
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
              color: 'var(--text-muted)',
            }}
          >
            {badge}
          </span>
        )}
        <AppIcon name={active ? 'chevronDown' : 'chevronRight'} size={14} style={{ color: 'var(--text-muted)' }} />
      </span>
    </button>
  )
}
