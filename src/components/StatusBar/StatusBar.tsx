import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../store/editor'

export default function StatusBar() {
  const { t } = useTranslation()
  const { cursorPos, wordCount, charCount } = useEditorStore()

  return (
    <div
      className="flex items-center px-4 gap-4 flex-shrink-0 text-xs select-none"
      style={{
        height: '24px',
        background: 'var(--statusbar-bg)',
        color: 'var(--statusbar-text)',
      }}
    >
      <span>{t('statusbar.lines', { line: cursorPos.line, col: cursorPos.col })}</span>
      <span>{t('statusbar.words', { count: wordCount })}</span>
      <span>{t('statusbar.chars', { count: charCount })}</span>
      <span className="flex-1" />
      <span>{t('statusbar.language')}</span>
      <span>{t('statusbar.encoding')}</span>
    </div>
  )
}
