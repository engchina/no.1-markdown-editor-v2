import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActiveTab } from '../../store/editor'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

interface WindowActionButtonProps {
  label: string
  onClick: () => void
  children: React.ReactNode
  emphasis?: boolean
}

function WindowActionButton({ label, onClick, children, emphasis }: WindowActionButtonProps) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="w-10 h-8 flex items-center justify-center rounded-md transition-colors"
      style={{ color: emphasis ? 'var(--text-secondary)' : 'var(--text-muted)' }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = emphasis
          ? 'color-mix(in srgb, var(--border) 82%, var(--bg-tertiary))'
          : 'var(--bg-tertiary)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function MacWindowButton({
  color,
  label,
  onClick,
}: {
  color: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="w-3 h-3 rounded-full border transition-transform"
      style={{
        background: color,
        borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = 'scale(1.08)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = 'scale(1)'
      }}
    />
  )
}

export default function TitleBar() {
  const { t } = useTranslation()
  const activeTab = useActiveTab()
  const [isMaximized, setIsMaximized] = useState(false)
  const isMac = useMemo(
    () => /mac/i.test(navigator.userAgent) || /mac/i.test(navigator.platform),
    []
  )

  useEffect(() => {
    if (!isTauri) return

    let unlisten: (() => void) | undefined

    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const currentWindow = getCurrentWindow()
      setIsMaximized(await currentWindow.isMaximized())
      unlisten = await currentWindow.onResized(async () => {
        setIsMaximized(await currentWindow.isMaximized())
      })
    })()

    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  const minimize = useCallback(() => {
    if (!isTauri) return
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().minimize())
  }, [])

  const toggleMaximize = useCallback(() => {
    if (!isTauri) return
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const currentWindow = getCurrentWindow()
      await currentWindow.toggleMaximize()
      setIsMaximized(await currentWindow.isMaximized())
    })
  }, [])

  const closeWindow = useCallback(() => {
    if (!isTauri) return
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close())
  }, [])

  const title = activeTab
    ? `${activeTab.isDirty ? '● ' : ''}${activeTab.name}`
    : 'No.1 Markdown Editor'

  return (
    <div
      className="flex items-center h-9 px-2 select-none border-b"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 82%, transparent)',
      }}
    >
      {isMac ? (
        <div className="flex items-center gap-2 px-2">
          <MacWindowButton
            color="color-mix(in srgb, var(--text-secondary) 34%, var(--bg-tertiary))"
            label={t('titleBar.close')}
            onClick={closeWindow}
          />
          <MacWindowButton
            color="color-mix(in srgb, var(--text-muted) 28%, var(--bg-tertiary))"
            label={t('titleBar.minimize')}
            onClick={minimize}
          />
          <MacWindowButton
            color="color-mix(in srgb, var(--text-muted) 22%, var(--bg-tertiary))"
            label={isMaximized ? t('titleBar.restore') : t('titleBar.maximize')}
            onClick={toggleMaximize}
          />
        </div>
      ) : (
        <div className="w-[120px]" />
      )}

      <div
        data-tauri-drag-region
        className="flex-1 h-full flex items-center justify-center text-xs font-medium tracking-[0.02em]"
        style={{ color: 'var(--text-secondary)' }}
        onDoubleClick={toggleMaximize}
      >
        <span className="truncate max-w-full px-4">{title}</span>
      </div>

      {isMac ? (
        <div className="w-[120px]" />
      ) : (
        <div className="flex items-center">
          <WindowActionButton label={t('titleBar.minimize')} onClick={minimize}>
            <span className="text-sm leading-none">−</span>
          </WindowActionButton>
          <WindowActionButton
            label={isMaximized ? t('titleBar.restore') : t('titleBar.maximize')}
            onClick={toggleMaximize}
          >
            <span className="text-xs leading-none">{isMaximized ? '❐' : '□'}</span>
          </WindowActionButton>
          <WindowActionButton label={t('titleBar.close')} onClick={closeWindow} emphasis>
            <span className="text-sm leading-none">×</span>
          </WindowActionButton>
        </div>
      )}
    </div>
  )
}
