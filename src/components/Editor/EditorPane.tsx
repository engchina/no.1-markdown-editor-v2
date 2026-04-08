import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import CodeMirrorEditor from './CodeMirrorEditor'
import { countDocumentStats } from '../../lib/editorStats'
import { useActiveTab, useEditorStore } from '../../store/editor'

export default function EditorPane() {
  const { t } = useTranslation()
  const activeTab = useActiveTab()
  const updateTabContent = useEditorStore((state) => state.updateTabContent)
  const setWordCount = useEditorStore((state) => state.setWordCount)

  const tabId = activeTab?.id ?? ''

  useEffect(() => {
    if (!activeTab) {
      setWordCount(0, 0)
      return
    }

    const stats = countDocumentStats(activeTab.content)
    setWordCount(stats.words, stats.chars)
  }, [activeTab, setWordCount])

  const handleChange = useCallback(
    (nextContent: string) => {
      if (!tabId) return

      updateTabContent(tabId, nextContent)
      const stats = countDocumentStats(nextContent)
      setWordCount(stats.words, stats.chars)
    },
    [setWordCount, tabId, updateTabContent]
  )

  if (!activeTab) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: 'var(--editor-bg)', color: 'var(--text-muted)' }}
      >
        <p className="text-sm">{t('app.noFileOpen')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--editor-bg)' }}>
      <div className="flex-1 min-h-0">
        <CodeMirrorEditor key={activeTab.id} content={activeTab.content} onChange={handleChange} />
      </div>
    </div>
  )
}
