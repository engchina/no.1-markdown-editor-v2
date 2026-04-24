import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../store/editor'
import { useExportStatusStore } from '../../store/exportStatus'
import AppIcon from '../Icons/AppIcon'

interface Props {
  saving?: boolean
}

export default function StatusBar({ saving }: Props) {
  const { t } = useTranslation()
  const { cursorPos, wordCount, charCount } = useEditorStore()
  const exportActivity = useExportStatusStore((state) => state.activity)
  const clearExportStatus = useExportStatusStore((state) => state.clearExportStatus)
  const exportStatusLabelKey = exportActivity
    ? exportActivity.phase === 'running'
      ? {
          html: 'statusbar.exportingHtml',
          pdf: 'statusbar.exportingPdf',
          markdown: 'statusbar.exportingMarkdown',
        }[exportActivity.kind]
      : {
          html: 'statusbar.exportHtmlDone',
          pdf: 'statusbar.exportPdfDone',
          markdown: 'statusbar.exportMarkdownDone',
        }[exportActivity.kind]
    : null

  useEffect(() => {
    if (exportActivity?.phase !== 'success') return

    const timer = window.setTimeout(() => {
      clearExportStatus()
    }, 1800)

    return () => window.clearTimeout(timer)
  }, [clearExportStatus, exportActivity])

  return (
    <div
      className="flex flex-shrink-0 select-none items-center gap-3 px-3 text-[11px]"
      style={{
        height: '24px',
        background: 'var(--statusbar-bg)',
        color: 'var(--statusbar-text)',
      }}
    >
      <span style={{ opacity: 0.85 }}>
        {t('statusbar.lines', { line: cursorPos.line, col: cursorPos.col })}
      </span>
      <span style={{ opacity: 0.7 }}>
        {t('statusbar.words', { count: wordCount })}
      </span>
      <span style={{ opacity: 0.7 }}>
        {t('statusbar.chars', { count: charCount })}
      </span>
      <div className="flex-1" />
      {exportActivity && (
        <span className="flex items-center gap-1.5" style={{ opacity: exportActivity.phase === 'running' ? 0.9 : 0.86 }}>
          {exportActivity.phase === 'running' ? (
            <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: 'currentColor' }} />
          ) : (
            <AppIcon name="checkCircle" size={12} />
          )}
          {exportStatusLabelKey ? t(exportStatusLabelKey) : null}
        </span>
      )}
      {saving && (
        <span className="flex items-center gap-1" style={{ opacity: 0.8 }}>
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'currentColor' }} />
          {t('statusbar.saving')}
        </span>
      )}
      <span style={{ opacity: 0.7 }}>{t('statusbar.language')}</span>
      <span style={{ opacity: 0.7 }}>{t('statusbar.encoding')}</span>
    </div>
  )
}
