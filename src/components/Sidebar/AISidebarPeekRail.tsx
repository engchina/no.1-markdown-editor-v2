import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { dispatchEditorAIOpen } from '../../lib/ai/events.ts'
import { createAISlashCommandEntries } from '../../lib/ai/slashCommands.ts'
import { createAITemplateOpenDetail, getAITemplateModels } from '../../lib/ai/templateLibrary.ts'
import { formatPrimaryShortcut } from '../../lib/platform.ts'
import AppIcon, { type IconName } from '../Icons/AppIcon'
import {
  getAITemplateIcon,
  type AISidebarPeekView,
  SIDEBAR_TAB_SOURCE,
} from './aiSidebarShared'

interface Props {
  view: AISidebarPeekView
  onClose: () => void
}

export default function AISidebarPeekRail({ view, onClose }: Props) {
  const { t } = useTranslation()
  // 'ask' is only used as a Quick Action entry point, not listed in the Prompt Library
  const templates = useMemo(() => getAITemplateModels(t).filter((tmpl) => tmpl.id !== 'ask'), [t])
  const slashCommands = useMemo(() => createAISlashCommandEntries(t), [t])
  const shortcut = formatPrimaryShortcut('J')
  const meta = getPeekMeta(view, t)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <aside
      id="ai-sidebar-peek-rail"
      role="dialog"
      aria-modal="false"
      aria-label={meta.title}
      data-ai-sidebar-peek={view}
      className="sidebar-peek-rail flex h-full flex-col overflow-hidden rounded-[28px] border"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 96%, transparent)',
        boxShadow: '0 28px 64px -28px rgba(15, 23, 42, 0.42)',
      }}
    >
      <div
        className="flex flex-shrink-0 items-start justify-between gap-3 border-b px-4 py-4"
        style={{
          borderBottomColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{
                background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                color: 'var(--accent)',
              }}
            >
              <AppIcon name={meta.icon} size={16} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {meta.title}
              </div>
              <p className="mt-0.5 text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
                {meta.detail}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          data-ai-sidebar-peek-close="true"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border text-sm transition-colors"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
            color: 'var(--text-muted)',
          }}
          title={t('ai.sidebar.peekClose')}
          aria-label={t('ai.sidebar.peekClose')}
        >
          ×
        </button>
      </div>

      <div className="sidebar-surface__scroll flex-1 overflow-y-auto px-4 py-4">
        {view === 'library' && (
          <div className="grid gap-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                data-ai-sidebar-template={template.id}
                onClick={() => {
                  dispatchEditorAIOpen(createAITemplateOpenDetail(template.id, t, SIDEBAR_TAB_SOURCE))
                  onClose()
                }}
                className="cursor-pointer rounded-[22px] border px-4 py-4 text-left transition-colors"
                style={{
                  borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                  background: 'color-mix(in srgb, var(--bg-secondary) 68%, transparent)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        color: 'var(--accent)',
                      }}
                    >
                      <AppIcon name={getAITemplateIcon(template.id)} size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {template.label}
                      </div>
                      <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                        {template.detail}
                      </p>
                    </div>
                  </div>

                  <PeekPill label={t(`ai.intent.${template.intent}`)} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <PeekPill label={t(`ai.outputTarget.${template.outputTarget}`)} />
                </div>
              </button>
            ))}
          </div>
        )}

        {view === 'commands' && (
          <div className="grid gap-3">
            <section
              className="rounded-[20px] border px-4 py-4"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                {t('ai.sidebar.shortcutLabel')}
              </div>
              <div
                className="mt-3 inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold"
                style={{
                  borderColor: 'color-mix(in srgb, var(--accent) 24%, var(--border))',
                  background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                }}
              >
                {shortcut}
              </div>
              <p className="mt-3 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                {t('ai.sidebar.peekCommandsDetail')}
              </p>
            </section>

            <section
              className="rounded-[20px] border px-4 py-4"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                {t('ai.sidebar.slashLabel')}
              </div>
              <div className="mt-3 grid gap-2">
                {slashCommands.map((entry) => (
                  <div
                    key={entry.id}
                    data-ai-sidebar-command={entry.id}
                    className="rounded-2xl border px-3 py-3"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
                      background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                    }}
                  >
                    <div
                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                      }}
                    >
                      /{entry.label}
                    </div>
                    <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                      {entry.detail}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </aside>
  )
}

function PeekPill({ label }: { label: string }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
        color: 'var(--text-muted)',
      }}
    >
      {label}
    </span>
  )
}

function getPeekMeta(view: AISidebarPeekView, t: (key: string) => string): { icon: IconName; title: string; detail: string } {
  if (view === 'library') {
    return {
      icon: 'copy',
      title: t('ai.sidebar.peekLibrary'),
      detail: t('ai.sidebar.peekLibraryDetail'),
    }
  }

  return {
    icon: 'keyboard',
    title: t('ai.sidebar.peekCommands'),
    detail: t('ai.sidebar.peekCommandsDetail'),
  }
}
