import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Toolbar from './components/Toolbar/Toolbar'
import Sidebar from './components/Sidebar/Sidebar'
import StatusBar from './components/StatusBar/StatusBar'
import ResizableDivider from './components/Layout/ResizableDivider'
import TitleBar from './components/TitleBar/TitleBar'
import NotificationCenter from './components/Notifications/NotificationCenter'
import { useAutoSave } from './hooks/useAutoSave'
import { useDocumentDrop } from './hooks/useDocumentDrop'
import { useFileOps } from './hooks/useFileOps'
import { useEditorStore } from './store/editor'
import { applyTheme, getThemeById } from './themes'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const EditorPane = lazy(() => import('./components/Editor/EditorPane'))
const MarkdownPreview = lazy(() => import('./components/Preview/MarkdownPreview'))
const CommandPalette = lazy(() => import('./components/CommandPalette/CommandPalette'))

function EditorPlaceholder() {
  const { t } = useTranslation()

  return (
    <div
      className="h-full flex items-center justify-center"
      style={{ background: 'var(--editor-bg)', color: 'var(--editor-text)' }}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-3xl px-8 py-6">
        <p
          className="text-xs uppercase tracking-[0.24em] mb-6"
          style={{ color: 'var(--text-muted)' }}
        >
          {t('app.loadingEditor')}
        </p>
        <div className="space-y-3 opacity-70">
          <div className="h-4 rounded-full animate-pulse" style={{ width: '44%', background: 'var(--bg-tertiary)' }} />
          <div className="h-4 rounded-full animate-pulse" style={{ width: '82%', background: 'var(--bg-tertiary)' }} />
          <div className="h-4 rounded-full animate-pulse" style={{ width: '72%', background: 'var(--bg-tertiary)' }} />
          <div className="h-4 rounded-full animate-pulse" style={{ width: '64%', background: 'var(--bg-tertiary)' }} />
        </div>
      </div>
    </div>
  )
}

function PreviewPlaceholder({ onActivate }: { onActivate: () => void }) {
  const { t } = useTranslation()

  return (
    <div
      className="h-full flex items-center justify-center"
      style={{ background: 'var(--preview-bg)', color: 'var(--preview-text)' }}
    >
      <div className="max-w-sm px-6 text-center">
        <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
          {t('preview.loading')}
        </p>
        <button
          onClick={onActivate}
          className="px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          {t('preview.loadNow')}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const { t } = useTranslation()
  const {
    viewMode,
    sidebarWidth,
    setSidebarWidth,
    sidebarOpen,
    editorRatio,
    setEditorRatio,
    focusMode,
    typewriterMode,
    activeThemeId,
  } = useEditorStore()
  const { saveAllDirtyTabs } = useFileOps()
  const [paletteMode, setPaletteMode] = useState<'command' | 'file' | null>(null)
  const [previewActivated, setPreviewActivated] = useState(viewMode === 'preview')
  const { saving } = useAutoSave()
  useDocumentDrop()

  useEffect(() => {
    applyTheme(getThemeById(activeThemeId))
  }, [activeThemeId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setPaletteMode('command')
      } else if (mod && !event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setPaletteMode('file')
      }

      if (event.key === 'F11') {
        event.preventDefault()
        const store = useEditorStore.getState()
        store.setFocusMode(!store.focusMode)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useEditorStore.getState().tabs.some((tab) => tab.isDirty)) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  useEffect(() => {
    if (!isTauri) return

    let unlisten: (() => void) | undefined

    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const { message } = await import('@tauri-apps/plugin-dialog')
      const currentWindow = getCurrentWindow()

      unlisten = await currentWindow.onCloseRequested(async (event) => {
        const dirtyTabs = useEditorStore.getState().tabs.filter((tab) => tab.isDirty)
        if (dirtyTabs.length === 0) return

        event.preventDefault()

        const saveLabel = dirtyTabs.length > 1 ? t('dialog.saveAll') : t('dialog.save')
        const discardLabel = t('dialog.dontSave')
        const cancelLabel = t('dialog.cancel')
        const messageText =
          dirtyTabs.length > 1
            ? t('dialog.unsavedMessageMultiple', { count: dirtyTabs.length })
            : t('dialog.unsavedMessage', { name: dirtyTabs[0].name })

        const result = await message(messageText, {
          title: t('dialog.unsavedChanges'),
          kind: 'warning',
          buttons: { yes: saveLabel, no: discardLabel, cancel: cancelLabel },
        })

        if (result === saveLabel) {
          const saved = await saveAllDirtyTabs()
          if (!saved) return
        } else if (result !== discardLabel) {
          return
        }

        await currentWindow.destroy()
      })
    })()

    return () => {
      if (unlisten) unlisten()
    }
  }, [saveAllDirtyTabs, t])

  const closePalette = useCallback(() => setPaletteMode(null), [])

  const showSidebar = sidebarOpen && !focusMode
  const showEditor = viewMode !== 'preview'
  const showPreview = viewMode !== 'source'

  useEffect(() => {
    if (!showPreview || previewActivated) return

    if (viewMode === 'preview') {
      setPreviewActivated(true)
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let idleId: number | undefined

    const activate = () => {
      if (!cancelled) setPreviewActivated(true)
    }

    if (typeof (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback === 'function') {
      const api = window as Window & {
        requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
        cancelIdleCallback: (handle: number) => void
      }
      idleId = api.requestIdleCallback(() => activate(), { timeout: 1200 })
    } else {
      timeoutId = setTimeout(activate, 300)
    }

    return () => {
      cancelled = true
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        ;(window as Window & { cancelIdleCallback: (handle: number) => void }).cancelIdleCallback(idleId)
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }, [previewActivated, showPreview, viewMode])

  const sidebarDragging = useRef(false)
  const sidebarStartX = useRef(0)
  const sidebarStartWidth = useRef(0)

  const renderEditorPane = () => (
    <Suspense fallback={<EditorPlaceholder />}>
      <EditorPane />
    </Suspense>
  )

  const onSidebarResizeStart = useCallback(
    (event: React.MouseEvent) => {
      sidebarDragging.current = true
      sidebarStartX.current = event.clientX
      sidebarStartWidth.current = sidebarWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!sidebarDragging.current) return
        const width = Math.max(
          160,
          Math.min(480, sidebarStartWidth.current + moveEvent.clientX - sidebarStartX.current)
        )
        setSidebarWidth(width)
      }

      const onMouseUp = () => {
        sidebarDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [setSidebarWidth, sidebarWidth]
  )

  return (
    <div
      className={`flex flex-col h-screen overflow-hidden${focusMode ? ' focus-mode' : ''}${typewriterMode ? ' typewriter-mode' : ''}`}
      style={{ background: 'transparent' }}
    >
      {paletteMode && (
        <Suspense fallback={null}>
          <CommandPalette mode={paletteMode} onClose={closePalette} />
        </Suspense>
      )}

      <NotificationCenter />

      {isTauri && <TitleBar />}

      {focusMode && (
        <div
          className="fixed top-10 right-3 z-50 text-xs px-3 py-1 rounded-full pointer-events-none select-none opacity-40"
          style={{
            background: 'var(--bg-secondary)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
        >
          {t('toolbar.focusMode')} · F11
        </div>
      )}

      <div
        className="relative z-20 flex-shrink-0 transition-all duration-300 px-4 pt-4 pb-2"
        style={{
          opacity: focusMode ? 0 : 1,
          height: focusMode ? 0 : 'auto',
          overflow: focusMode ? 'hidden' : 'visible',
          pointerEvents: focusMode ? 'none' : 'auto',
        }}
      >
        <Toolbar onOpenPalette={() => setPaletteMode('command')} saving={saving} />
      </div>

      <div className="flex flex-1 min-h-0 px-4 pb-4 gap-4">
        {showSidebar && (
          <>
            <div
              className="flex-shrink-0 flex flex-col overflow-hidden transition-all duration-300"
              style={{ width: sidebarWidth }}
            >
              <Sidebar width={sidebarWidth} />
            </div>
            <div
              className="flex-shrink-0 cursor-col-resize transition-all duration-300 ease-in-out hover:w-1"
              style={{ width: '4px', margin: '0 2px', background: 'transparent', borderRadius: '4px' }}
              onMouseDown={onSidebarResizeStart}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 50%, transparent)'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent'
              }}
            />
          </>
        )}

        <div
          className="flex flex-1 min-w-0 rounded-2xl overflow-hidden shadow-elegant relative"
          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
        >
          {focusMode ? (
            <div className="flex-1 min-w-0 overflow-hidden flex items-start justify-center focus-mode-container h-full">
              <div className="focus-mode-column h-full w-full">
                {renderEditorPane()}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 min-w-0 h-full">
              {showEditor && (
                <div
                  className="flex-shrink-0 overflow-hidden"
                  style={{ width: showPreview ? `${editorRatio * 100}%` : '100%' }}
                >
                  {renderEditorPane()}
                </div>
              )}

              {showEditor && showPreview && (
                <ResizableDivider
                  onResize={(delta, totalWidth) => {
                    const nextRatio = Math.max(0.2, Math.min(0.8, editorRatio + delta / totalWidth))
                    setEditorRatio(nextRatio)
                  }}
                />
              )}

              {showPreview && (
                <div className="flex-1 min-w-0 overflow-hidden">
                  {previewActivated ? (
                    <Suspense fallback={<PreviewPlaceholder onActivate={() => setPreviewActivated(true)} />}>
                      <MarkdownPreview />
                    </Suspense>
                  ) : (
                    <PreviewPlaceholder onActivate={() => setPreviewActivated(true)} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!focusMode && <StatusBar saving={saving} />}
    </div>
  )
}
