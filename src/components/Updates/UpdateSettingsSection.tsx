import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { openGitHubReleasesPage, runManualUpdateCheck } from '../../lib/updateActions'
import { getBundledAppVersion, getCurrentAppVersion, isDesktopApp } from '../../lib/update'
import { useUpdateStore } from '../../store/update'
import AppIcon from '../Icons/AppIcon'

interface UpdateSettingsSectionProps {
  showSectionLabel?: boolean
}

export default function UpdateSettingsSection({ showSectionLabel = true }: UpdateSettingsSectionProps) {
  const { t } = useTranslation()
  const autoCheckEnabled = useUpdateStore((state) => state.autoCheckEnabled)
  const setAutoCheckEnabled = useUpdateStore((state) => state.setAutoCheckEnabled)
  const isChecking = useUpdateStore((state) => state.isChecking)
  const [appVersion, setAppVersion] = useState(getBundledAppVersion())
  const desktopApp = isDesktopApp()

  useEffect(() => {
    let cancelled = false

    void getCurrentAppVersion()
      .then((version) => {
        if (!cancelled) setAppVersion(version)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div data-update-settings="true">
      {showSectionLabel && (
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
          {t('updates.aboutAndUpdates')}
        </p>
      )}

      <div
        className="space-y-4 rounded-[1.25rem] px-4 py-4"
        style={{
          border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('app.name')}
            </div>
            <div className="mt-1 text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
              {t('updates.versionLabel', { version: appVersion })}
            </div>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              color: 'var(--accent)',
            }}
          >
            v{appVersion}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void runManualUpdateCheck()
            }}
            disabled={isChecking}
            className="rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            <span className="flex items-center gap-2">
              <AppIcon name="download" size={14} />
              <span>{isChecking ? t('updates.checking') : t('updates.checkForUpdates')}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              void openGitHubReleasesPage()
            }}
            className="rounded-xl border px-3 py-2 text-xs transition-colors"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
              background: 'transparent',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="flex items-center gap-2">
              <AppIcon name="globe" size={14} />
              <span>{t('updates.githubReleases')}</span>
            </span>
          </button>
        </div>

        {desktopApp && (
          <label className="flex items-center justify-between cursor-pointer gap-3">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t('updates.autoCheckOnLaunch')}
            </span>
            <button
              type="button"
              onClick={() => setAutoCheckEnabled(!autoCheckEnabled)}
              className="relative rounded-full transition-colors flex-shrink-0"
              style={{
                width: '36px',
                height: '20px',
                background: autoCheckEnabled ? 'var(--accent)' : 'var(--bg-tertiary)',
              }}
            >
              <span
                className="absolute top-0.5 rounded-full transition-transform"
                style={{
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  left: autoCheckEnabled ? '18px' : '2px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </button>
          </label>
        )}
      </div>
    </div>
  )
}
