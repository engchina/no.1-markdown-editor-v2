import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotificationsStore, type Notice } from '../../store/notifications'
import AppIcon from '../Icons/AppIcon'

const NOTICE_STYLES: Record<Notice['kind'], { accent: string; icon: Parameters<typeof AppIcon>[0]['name'] }> = {
  info: { accent: 'var(--accent)', icon: 'infoCircle' },
  success: { accent: '#16a34a', icon: 'checkCircle' },
  error: { accent: '#dc2626', icon: 'alertCircle' },
}

export default function NotificationCenter() {
  const { t } = useTranslation()
  const notices = useNotificationsStore((state) => state.notices)
  const dismissNotice = useNotificationsStore((state) => state.dismissNotice)

  useEffect(() => {
    const timers = notices.map((notice) =>
      window.setTimeout(
        () => dismissNotice(notice.id),
        Math.max(0, notice.expiresAt - Date.now())
      )
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [dismissNotice, notices])

  if (notices.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[120] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {notices.map((notice) => {
        const style = NOTICE_STYLES[notice.kind]
        return (
          <div
            key={notice.id}
            className="pointer-events-auto animate-in rounded-2xl border p-4 shadow-xl glass-panel"
            role={notice.kind === 'error' ? 'alert' : 'status'}
            style={{
              borderColor: `color-mix(in srgb, ${style.accent} 36%, var(--border))`,
              background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${style.accent} 18%, transparent)`,
                  color: style.accent,
                }}
              >
                <AppIcon name={style.icon} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-5" style={{ color: 'var(--text-primary)' }}>
                  {notice.title}
                </p>
                {notice.message && (
                  <p className="mt-1 text-sm leading-5" style={{ color: 'var(--text-secondary)' }}>
                    {notice.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="cursor-pointer rounded-full p-1 transition-colors hover:opacity-100 focus-visible:outline-none focus-visible:ring-2"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => dismissNotice(notice.id)}
                aria-label={t('notices.dismissLabel')}
              >
                <span className="block text-base leading-none">×</span>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
