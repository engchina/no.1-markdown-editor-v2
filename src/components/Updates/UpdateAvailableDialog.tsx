import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadAvailableRelease } from '../../lib/updateActions'
import { formatPublishedAt, normalizeReleaseNotes } from '../../lib/update'
import { focusElementWithoutScroll, useDialogFocusRestore } from '../../hooks/useDialogFocusRestore'
import { useUpdateStore } from '../../store/update'
import AppIcon from '../Icons/AppIcon'

export default function UpdateAvailableDialog() {
  const { t, i18n } = useTranslation()
  const dialogOpen = useUpdateStore((state) => state.dialogOpen)
  const release = useUpdateStore((state) => state.availableRelease)
  const closeUpdateDialog = useUpdateStore((state) => state.closeUpdateDialog)
  const skipVersion = useUpdateStore((state) => state.skipVersion)
  const downloadButtonRef = useRef<HTMLButtonElement>(null)

  useDialogFocusRestore(downloadButtonRef)

  useEffect(() => {
    if (!dialogOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeUpdateDialog()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeUpdateDialog, dialogOpen])

  useEffect(() => {
    if (!dialogOpen) return
    focusElementWithoutScroll(downloadButtonRef.current)
  }, [dialogOpen])

  const releaseNotes = useMemo(() => {
    if (!release) return ''
    return normalizeReleaseNotes(release.releaseNotes)
  }, [release])

  if (!dialogOpen || !release) return null

  const publishedAt = formatPublishedAt(release.publishedAt, i18n.language)

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--bg-primary) 34%, rgba(0, 0, 0, 0.44))' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeUpdateDialog()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('updates.dialogTitle')}
        className="glass-panel animate-in flex w-full max-w-[min(640px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.5rem] shadow-2xl"
        style={{
          maxHeight: 'calc(100dvh - 2rem)',
          background: 'color-mix(in srgb, var(--bg-primary) 96%, transparent)',
          borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
        }}
      >
        <div
          className="flex flex-shrink-0 items-start gap-4 px-5 py-4"
          style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 78%, transparent)' }}
        >
          <div
            className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
              color: 'var(--accent)',
            }}
          >
            <AppIcon name="download" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('updates.dialogTitle')}
            </h2>
            <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {t('updates.dialogMessage')}
            </p>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <UpdateVersionCard
              label={t('updates.currentVersion')}
              value={release.currentVersion}
            />
            <UpdateVersionCard
              label={t('updates.latestVersion')}
              value={release.latestVersion}
              accent
            />
          </div>

          {publishedAt && (
            <div
              className="rounded-2xl px-4 py-3 text-sm"
              style={{
                border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{t('updates.publishedAt')}</span>
              <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                {publishedAt}
              </span>
            </div>
          )}

          <section
            className="rounded-[1.25rem] px-4 py-4"
            style={{
              border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
              background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
            }}
          >
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
              <h3 className="flex-shrink-0 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('updates.releaseNotes')}
              </h3>
              {release.assetName && (
                <span
                  className="min-w-0 max-w-[65%] truncate rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    color: 'var(--accent)',
                  }}
                >
                  {release.assetName}
                </span>
              )}
            </div>
            <div
              className="overflow-y-auto rounded-xl px-3 py-3 text-sm leading-6"
              style={{
                maxHeight: 'clamp(120px, 32dvh, 240px)',
                background: 'color-mix(in srgb, var(--bg-primary) 72%, transparent)',
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {releaseNotes || t('updates.releaseNotesEmpty')}
            </div>
          </section>
        </div>

        <div
          className="flex flex-shrink-0 flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-end"
          style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 78%, transparent)' }}
        >
          <button
            ref={downloadButtonRef}
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await downloadAvailableRelease(release)
                  closeUpdateDialog()
                } catch {
                  // Error notice is already handled in the download helper.
                }
              })()
            }}
            className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            {t('updates.downloadLatest')}
          </button>
          <button
            type="button"
            onClick={() => skipVersion(release.latestVersion)}
            className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: 'color-mix(in srgb, var(--bg-secondary) 92%, transparent)',
              color: 'var(--text-secondary)',
              border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
            }}
          >
            {t('updates.skipVersion')}
          </button>
          <button
            type="button"
            onClick={closeUpdateDialog}
            className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
            }}
          >
            {t('updates.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

function UpdateVersionCard({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      className="rounded-[1.25rem] px-4 py-4"
      style={{
        border: accent
          ? '1px solid color-mix(in srgb, var(--accent) 42%, transparent)'
          : '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
        background: accent
          ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-secondary))'
          : 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
      }}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold" style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}
