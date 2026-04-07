import { useEffect } from 'react'
import { useEditorStore } from './store/editor'
import Toolbar from './components/Toolbar/Toolbar'
import Sidebar from './components/Sidebar/Sidebar'
import EditorPane from './components/Editor/EditorPane'
import MarkdownPreview from './components/Preview/MarkdownPreview'
import StatusBar from './components/StatusBar/StatusBar'
import ResizableDivider from './components/Layout/ResizableDivider'

export default function App() {
  const { theme, viewMode, sidebarWidth, sidebarOpen, editorRatio, setEditorRatio } = useEditorStore()

  // Apply theme class (themes/index.ts handles the actual CSS vars)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const showSidebar = viewMode !== 'focus' && sidebarOpen
  const showEditor = viewMode !== 'preview'
  const showPreview = viewMode !== 'source'

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Toolbar */}
      <Toolbar />

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {showSidebar && (
          <>
            <Sidebar width={sidebarWidth} />
            <div
              className="panel-divider flex-shrink-0"
              style={{ width: '1px', background: 'var(--border)' }}
            />
          </>
        )}

        {/* Editor + Preview */}
        <div className="flex flex-1 min-w-0">
          {showEditor && (
            <div
              className="flex-shrink-0 overflow-hidden"
              style={{ width: showPreview ? `${editorRatio * 100}%` : '100%' }}
            >
              <EditorPane />
            </div>
          )}

          {showEditor && showPreview && (
            <ResizableDivider
              onResize={(delta, totalWidth) => {
                const newRatio = Math.max(0.2, Math.min(0.8, editorRatio + delta / totalWidth))
                setEditorRatio(newRatio)
              }}
            />
          )}

          {showPreview && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <MarkdownPreview />
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  )
}
