import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import CodeMirrorEditor from './CodeMirrorEditor'
import { useFileOps } from '../../hooks/useFileOps'
import { countDocumentStats } from '../../lib/editorStats'
import { useActiveTab, useEditorStore } from '../../store/editor'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export default function EditorPane() {
  const { t } = useTranslation()
  const activeTab = useActiveTab()
  const tabs = useEditorStore((state) => state.tabs)
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
      {tabs.length > 1 && <TabBar />}

      <div className="flex-1 min-h-0">
        <CodeMirrorEditor key={activeTab.id} content={activeTab.content} onChange={handleChange} />
      </div>
    </div>
  )
}

function TabBar() {
  const { t } = useTranslation()
  const tabs = useEditorStore((state) => state.tabs)
  const activeTabId = useEditorStore((state) => state.activeTabId)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const closeTab = useEditorStore((state) => state.closeTab)
  const { saveTabById } = useFileOps()

  const requestCloseTab = useCallback(
    async (tabId: string) => {
      const tab = useEditorStore.getState().tabs.find((entry) => entry.id === tabId)
      if (!tab) return

      if (!tab.isDirty) {
        closeTab(tab.id)
        return
      }

      const messageText = t('dialog.unsavedMessage', { name: tab.name })
      if (isTauri) {
        const { message } = await import('@tauri-apps/plugin-dialog')
        const saveLabel = t('dialog.save')
        const discardLabel = t('dialog.dontSave')
        const cancelLabel = t('dialog.cancel')

        const result = await message(messageText, {
          title: t('dialog.unsavedChanges'),
          kind: 'warning',
          buttons: { yes: saveLabel, no: discardLabel, cancel: cancelLabel },
        })

        if (result === saveLabel) {
          const saved = await saveTabById(tab.id)
          if (!saved) return
          closeTab(tab.id)
        } else if (result === discardLabel) {
          closeTab(tab.id)
        }
        return
      }

      const saveRequested = window.confirm(
        `${messageText}\n\nPress OK to save changes before closing.\nPress Cancel for discard options.`
      )
      if (saveRequested) {
        const saved = await saveTabById(tab.id)
        if (!saved) return
        closeTab(tab.id)
        return
      }

      const discardRequested = window.confirm(
        `${t('dialog.discardMessage', { name: tab.name })}\n\nPress OK to discard changes and close this tab.\nPress Cancel to keep the tab open.`
      )

      if (discardRequested) {
        closeTab(tab.id)
      }
    },
    [closeTab, saveTabById, t]
  )

  return (
    <div
      className="flex items-center overflow-x-auto flex-shrink-0"
      style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        height: '36px',
      }}
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="flex items-center gap-1 px-3 h-full cursor-pointer flex-shrink-0 group"
          style={{
            background: tab.id === activeTabId ? 'var(--editor-bg)' : 'transparent',
            borderRight: '1px solid var(--border)',
            color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '13px',
            maxWidth: '180px',
          }}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="truncate">
            {tab.isDirty ? '●  ' : ''}
            {tab.name}
          </span>
          <button
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity flex-shrink-0"
            style={{ lineHeight: 1, fontSize: '16px' }}
            onClick={(event) => {
              event.stopPropagation()
              void requestCloseTab(tab.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
