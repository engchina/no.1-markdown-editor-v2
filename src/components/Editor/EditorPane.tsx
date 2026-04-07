import { useCallback } from 'react'
import CodeMirrorEditor from './CodeMirrorEditor'
import { useEditorStore, useActiveTab } from '../../store/editor'

export default function EditorPane() {
  const activeTab = useActiveTab()
  const { updateTabContent, setWordCount, tabs } = useEditorStore()

  const tabId = activeTab?.id ?? ''

  const handleChange = useCallback(
    (content: string) => {
      if (!tabId) return
      updateTabContent(tabId, content)

      // Word / char count
      const text = content.trim()
      const words = text ? text.split(/\s+/).length : 0
      setWordCount(words, content.length)
    },
    [tabId, updateTabContent, setWordCount]
  )

  if (!activeTab) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: 'var(--editor-bg)', color: 'var(--text-muted)' }}
      >
        <p className="text-sm">No file open</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--editor-bg)' }}>
      {/* Tab bar (if multiple tabs) */}
      {tabs.length > 1 && (
        <TabBar />
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <CodeMirrorEditor
          key={activeTab.id}
          content={activeTab.content}
          onChange={handleChange}
        />
      </div>
    </div>
  )
}

function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useEditorStore()

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
          <span className="truncate">{tab.isDirty ? '●  ' : ''}{tab.name}</span>
          <button
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity flex-shrink-0"
            style={{ lineHeight: 1, fontSize: '16px' }}
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
