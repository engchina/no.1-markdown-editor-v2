import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { countDocumentStats } from '../../lib/editorStats'
import {
  buildMergedTextFromLineDiff,
  diffTextByLine,
  type LineDiffBlock,
  type LineDiffChoice,
} from '../../lib/lineDiff'
import { pushInfoNotice } from '../../lib/notices'
import { useEditorStore } from '../../store/editor'
import AppIcon from '../Icons/AppIcon'

function summarizeDocument(content: string): { lines: number; words: number; chars: number } {
  return {
    lines: content.length === 0 ? 1 : content.split(/\r?\n/).length,
    ...countDocumentStats(content),
  }
}

export default function ExternalFileConflictDialog() {
  const { t } = useTranslation()
  const conflicts = useEditorStore((state) => state.externalFileConflicts)
  const missingFiles = useEditorStore((state) => state.externalMissingFiles)
  const tabs = useEditorStore((state) => state.tabs)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const resolveExternalFileConflict = useEditorStore((state) => state.resolveExternalFileConflict)
  const replaceTabFromDisk = useEditorStore((state) => state.replaceTabFromDisk)
  const dismissExternalFileConflict = useEditorStore((state) => state.dismissExternalFileConflict)
  const keepButtonRef = useRef<HTMLButtonElement>(null)
  const [blockChoices, setBlockChoices] = useState<Record<string, LineDiffChoice>>({})

  const conflict = conflicts[0] ?? null
  const tab = useMemo(
    () => (conflict ? tabs.find((entry) => entry.id === conflict.tabId) ?? null : null),
    [conflict, tabs]
  )

  useEffect(() => {
    if (!conflict) return
    if (tab) setActiveTab(tab.id)
    keepButtonRef.current?.focus()
  }, [conflict?.tabId, setActiveTab, tab])

  useEffect(() => {
    if (!conflict || !tab) return

    const nextChoices = Object.fromEntries(
      diffTextByLine(tab.content, conflict.diskContent)
        .filter((block) => block.type === 'change')
        .map((block) => [block.id, 'local' as const])
    )
    setBlockChoices(nextChoices)
  }, [conflict?.tabId, conflict?.diskContent, tab?.content, tab?.id])

  useEffect(() => {
    if (!conflict || tab) return
    dismissExternalFileConflict(conflict.tabId)
  }, [conflict, dismissExternalFileConflict, tab])

  if (missingFiles.length > 0 || !conflict || !tab) return null

  const queuedConflicts = conflicts.length - 1
  const blocks = useMemo(() => diffTextByLine(tab.content, conflict.diskContent), [conflict.diskContent, tab.content])
  const changedBlocks = useMemo(() => blocks.filter((block) => block.type === 'change'), [blocks])
  const mergedContent = useMemo(
    () => buildMergedTextFromLineDiff(blocks, new Map(Object.entries(blockChoices))),
    [blockChoices, blocks]
  )
  const localSummary = summarizeDocument(tab.content)
  const diskSummary = summarizeDocument(conflict.diskContent)
  const mergedSummary = summarizeDocument(mergedContent)

  const keepLocalEdits = () => {
    setActiveTab(tab.id)
    resolveExternalFileConflict(conflict.tabId, tab.content, conflict.diskContent)
  }

  const reloadFromDisk = () => {
    setActiveTab(tab.id)
    replaceTabFromDisk(conflict.tabId, conflict.diskContent)
    pushInfoNotice('notices.externalFileReloadedTitle', 'notices.externalFileReloadedMessage', {
      values: { name: tab.name },
      timeoutMs: 2800,
    })
  }

  const applyMergedResult = () => {
    setActiveTab(tab.id)
    resolveExternalFileConflict(conflict.tabId, mergedContent, conflict.diskContent)
    if (mergedContent !== conflict.diskContent) {
      pushInfoNotice('notices.externalFileMergedTitle', 'notices.externalFileMergedMessage', {
        values: { name: tab.name },
        timeoutMs: 3200,
      })
    }
  }

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--bg-primary) 34%, rgba(0, 0, 0, 0.44))' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('externalConflict.title')}
        className="glass-panel animate-in flex w-full max-w-[min(1100px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.5rem] shadow-2xl"
        style={{
          background: 'color-mix(in srgb, var(--bg-primary) 96%, transparent)',
          borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
          maxHeight: 'min(86vh, 920px)',
        }}
      >
        <div className="flex items-start gap-4 px-5 py-4" style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 78%, transparent)' }}>
          <div
            className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: 'color-mix(in srgb, #dc2626 16%, transparent)',
              color: '#dc2626',
            }}
          >
            <AppIcon name="alertCircle" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="truncate text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('externalConflict.title')}
              </h2>
              {queuedConflicts > 0 && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    color: 'var(--accent)',
                  }}
                >
                  {t('externalConflict.queue', { count: queuedConflicts })}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {t('externalConflict.description')}
            </p>
            <div
              className="mt-3 rounded-xl px-3 py-2 text-[12px]"
              style={{
                background: 'color-mix(in srgb, var(--bg-secondary) 84%, transparent)',
                border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
              }}
            >
              {conflict.path}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden px-5 py-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <ConflictPane
            title={t('externalConflict.mergedTitle')}
            subtitle={t('externalConflict.mergedSubtitle')}
            statsLabel={t('externalConflict.stats', mergedSummary)}
            value={mergedContent}
            accent="var(--accent)"
          />
          <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <div
              className="rounded-2xl px-4 py-3"
              style={{
                border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                    color: 'var(--accent)',
                  }}
                >
                  {t('externalConflict.stats', localSummary)}
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{
                    background: 'color-mix(in srgb, #dc2626 14%, transparent)',
                    color: '#dc2626',
                  }}
                >
                  {t('externalConflict.stats', diskSummary)}
                </span>
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="space-y-3">
                {changedBlocks.map((block, index) => (
                  <ChangeBlockCard
                    key={block.id}
                    block={block}
                    index={index}
                    choice={blockChoices[block.id] ?? 'local'}
                    onChoiceChange={(nextChoice) => {
                      setBlockChoices((current) => ({
                        ...current,
                        [block.id]: nextChoice,
                      }))
                    }}
                    t={t}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>

        <div
          className="flex flex-col gap-3 px-5 py-4"
          style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 78%, transparent)' }}
        >
          <p className="text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
            {t('externalConflict.overwriteHint')}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              ref={keepButtonRef}
              type="button"
              onClick={keepLocalEdits}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: 'var(--accent)',
                color: 'white',
              }}
            >
              {t('externalConflict.keepMine')}
            </button>
            <button
              type="button"
              onClick={applyMergedResult}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: 'color-mix(in srgb, var(--bg-secondary) 92%, transparent)',
                color: 'var(--text-secondary)',
                border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
              }}
            >
              {t('externalConflict.applyMerged')}
            </button>
            <button
              type="button"
              onClick={reloadFromDisk}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: 'color-mix(in srgb, #dc2626 14%, transparent)',
                color: '#dc2626',
                border: '1px solid color-mix(in srgb, #dc2626 28%, transparent)',
              }}
            >
              {t('externalConflict.reloadDisk')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChangeBlockCard({
  block,
  index,
  choice,
  onChoiceChange,
  t,
}: {
  block: LineDiffBlock
  index: number
  choice: LineDiffChoice
  onChoiceChange: (nextChoice: LineDiffChoice) => void
  t: ReturnType<typeof useTranslation>['t']
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl"
      style={{
        border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
        background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 70%, transparent)' }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('externalConflict.changeBlock', { count: index + 1 })}
          </p>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
            {t('externalConflict.changeBlockHint')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ChoiceButton
            active={choice === 'local'}
            label={t('externalConflict.keepMine')}
            onClick={() => onChoiceChange('local')}
            accent="var(--accent)"
          />
          <ChoiceButton
            active={choice === 'disk'}
            label={t('externalConflict.useDiskBlock')}
            onClick={() => onChoiceChange('disk')}
            accent="#dc2626"
          />
        </div>
      </div>

      <div className="grid gap-px md:grid-cols-2" style={{ background: 'color-mix(in srgb, var(--border) 68%, transparent)' }}>
        <DiffColumn
          title={t('externalConflict.localTitle')}
          value={block.localLines.join('')}
          accent="var(--accent)"
        />
        <DiffColumn
          title={t('externalConflict.diskTitle')}
          value={block.diskLines.join('')}
          accent="#dc2626"
        />
      </div>
    </section>
  )
}

function ChoiceButton({
  active,
  label,
  onClick,
  accent,
}: {
  active: boolean
  label: string
  onClick: () => void
  accent: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: active ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'transparent',
        color: active ? accent : 'var(--text-muted)',
        border: `1px solid ${active ? `color-mix(in srgb, ${accent} 28%, transparent)` : 'color-mix(in srgb, var(--border) 78%, transparent)'}`,
      }}
    >
      {label}
    </button>
  )
}

function DiffColumn({
  title,
  value,
  accent,
}: {
  title: string
  value: string
  accent: string
}) {
  return (
    <div
      className="min-h-[180px] px-4 py-3"
      style={{
        background: 'color-mix(in srgb, var(--bg-primary) 96%, transparent)',
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
        {title}
      </p>
      <textarea
        readOnly
        spellCheck={false}
        value={value}
        className="mt-3 min-h-[140px] w-full resize-none bg-transparent text-[12px] leading-6 outline-none"
        style={{
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        }}
      />
    </div>
  )
}

function ConflictPane({
  title,
  subtitle,
  statsLabel,
  value,
  accent,
}: {
  title: string
  subtitle: string
  statsLabel: string
  value: string
  accent: string
}) {
  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl"
      style={{
        border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
        background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
      }}
    >
      <div
        className="flex items-start justify-between gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 70%, transparent)' }}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </p>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          {statsLabel}
        </span>
      </div>
      <textarea
        readOnly
        spellCheck={false}
        value={value}
        className="min-h-[240px] w-full flex-1 resize-none bg-transparent px-4 py-3 text-[12px] leading-6 outline-none"
        style={{
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        }}
      />
    </section>
  )
}
