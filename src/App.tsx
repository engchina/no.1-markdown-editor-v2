import { Suspense, lazy, type CSSProperties, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Toolbar from './components/Toolbar/Toolbar'
import Sidebar from './components/Sidebar/Sidebar'
import StatusBar from './components/StatusBar/StatusBar'
import DocumentTabs from './components/DocumentTabs/DocumentTabs'
import ResizableDivider from './components/Layout/ResizableDivider'
import TitleBar from './components/TitleBar/TitleBar'
import NotificationCenter from './components/Notifications/NotificationCenter'
import RecoverableErrorBoundary from './components/ErrorBoundary/RecoverableErrorBoundary'
import ErrorFallback from './components/ErrorBoundary/ErrorFallback'
import { buildAIContextPacket, resolveCurrentBlockRange } from './lib/ai/context'
import { dispatchEditorAIOpen, EDITOR_AI_OPEN_EVENT, type EditorAIOpenDetail } from './lib/ai/events'
import { resolveAIOpenOutputTarget } from './lib/ai/opening'
import { useAutoSave } from './hooks/useAutoSave'
import { useDocumentDrop } from './hooks/useDocumentDrop'
import { useExternalFileChanges } from './hooks/useExternalFileChanges'
import { useFileOps } from './hooks/useFileOps'
import { openDesktopDocumentPaths, SINGLE_INSTANCE_OPEN_FILES_EVENT } from './lib/desktopFileOpen'
import { resolveFocusInlinePaddingPx, resolveFocusWidthPx } from './lib/focusWidth'
import { clampSidebarWidth, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from './lib/layout'
import { hasPrimaryModifier, matchesPrimaryShortcut } from './lib/platform'
import { maybeRunAutomaticUpdateCheck } from './lib/updateActions'
import { KEYBOARD_SHORTCUTS_OPEN_EVENT } from './lib/keyboardShortcuts'
import { useAIStore } from './store/ai'
import { useUpdateStore } from './store/update'
import { useActiveTab, useEditorStore } from './store/editor'
import { applyTheme, getThemeById } from './themes'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const EditorPane = lazy(() => import('./components/Editor/EditorPane'))
const MarkdownPreview = lazy(() => import('./components/Preview/MarkdownPreview'))
const CommandPalette = lazy(() => import('./components/CommandPalette/CommandPalette'))
const KeyboardShortcutsDialog = lazy(() => import('./components/KeyboardShortcuts/KeyboardShortcutsDialog'))
const AIComposer = lazy(() => import('./components/AI/AIComposer'))
const UpdateAvailableDialog = lazy(() => import('./components/Updates/UpdateAvailableDialog'))
const ExternalMissingFileDialog = lazy(() => import('./components/ExternalFileConflicts/ExternalMissingFileDialog'))
const ExternalFileConflictDialog = lazy(() => import('./components/ExternalFileConflicts/ExternalFileConflictDialog'))

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
    focusWidthMode,
    focusWidthCustomPx,
    typewriterMode,
    activeThemeId,
    wysiwygMode,
    zoom,
  } = useEditorStore()
  const activeTab = useActiveTab()
  const aiComposerOpen = useAIStore((state) => state.composer.open)
  const updateDialogOpen = useUpdateStore((state) => state.dialogOpen)
  const externalMissingDialogOpen = useEditorStore((state) => state.externalMissingFiles.length > 0)
  const externalConflictDialogOpen = useEditorStore(
    (state) => state.externalMissingFiles.length === 0 && state.externalFileConflicts.length > 0
  )
  const { saveAllDirtyTabs, closeActiveFile } = useFileOps()
  const [paletteMode, setPaletteMode] = useState<'command' | 'file' | null>(null)
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false)
  const [previewActivated, setPreviewActivated] = useState(viewMode === 'preview')
  const { saving } = useAutoSave()
  const focusColumnWidth = resolveFocusWidthPx(focusWidthMode, focusWidthCustomPx)
  const focusColumnPadding = resolveFocusInlinePaddingPx(focusColumnWidth)
  const resolvedSidebarWidth = clampSidebarWidth(sidebarWidth)
  const splitEditorPercent = Math.round(editorRatio * 100)
  const splitPreviewPercent = 100 - splitEditorPercent
  const appStyle = {
    background: 'transparent',
    '--focus-column-max-width': `${focusColumnWidth}px`,
    '--focus-column-inline-padding': `${focusColumnPadding}px`,
    zoom: `${zoom}%`,
  } as CSSProperties
  useDocumentDrop()
  useExternalFileChanges()

  useEffect(() => {
    applyTheme(getThemeById(activeThemeId))
  }, [activeThemeId])

  useEffect(() => {
    void maybeRunAutomaticUpdateCheck()
  }, [])

  useEffect(() => {
    if (sidebarWidth === resolvedSidebarWidth) return
    setSidebarWidth(resolvedSidebarWidth)
  }, [resolvedSidebarWidth, setSidebarWidth, sidebarWidth])

  useEffect(() => {
    if (!isTauri) return

    let unlistenOpenFiles: (() => void) | undefined

    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const currentWindow = getCurrentWindow()

        unlistenOpenFiles = await currentWindow.listen<string[]>(SINGLE_INSTANCE_OPEN_FILES_EVENT, (event) => {
          const paths = Array.isArray(event.payload) ? event.payload : []
          void openDesktopDocumentPaths(paths)
        })

        const pendingPaths = await invoke<string[]>('take_pending_open_paths')
        await openDesktopDocumentPaths(Array.isArray(pendingPaths) ? pendingPaths : [])
      } catch (error) {
        console.error('Load launch files error:', error)
      }
    })()

    return () => {
      if (unlistenOpenFiles) unlistenOpenFiles()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesPrimaryShortcut(event, { key: 'p', shift: true })) {
        event.preventDefault()
        setPaletteMode('command')
      } else if (matchesPrimaryShortcut(event, { key: 'p' })) {
        event.preventDefault()
        setPaletteMode('file')
      } else if (matchesPrimaryShortcut(event, { key: 'j' })) {
        event.preventDefault()
        dispatchEditorAIOpen({ source: 'shortcut' })
      } else if (matchesPrimaryShortcut(event, { key: '/' })) {
        event.preventDefault()
        setKeyboardShortcutsOpen(true)
      } else if (matchesPrimaryShortcut(event, { key: 'w' })) {
        event.preventDefault()
        if (!event.repeat) void closeActiveFile()
      }

      if (event.key === 'F11') {
        event.preventDefault()
        const store = useEditorStore.getState()
        store.setFocusMode(!store.focusMode)
      }

      if (matchesPrimaryShortcut(event, { code: 'Backslash' })) {
        event.preventDefault()
        const store = useEditorStore.getState()
        store.setSidebarOpen(!store.sidebarOpen)
        return
      }

      if (event.altKey || !hasPrimaryModifier(event)) return

      const store = useEditorStore.getState()
      if (event.code === 'Equal' || event.key === '=' || event.key === '+') {
        event.preventDefault()
        store.setZoom(Math.min(300, store.zoom + 10))
      } else if (event.code === 'Minus' || event.key === '-') {
        event.preventDefault()
        store.setZoom(Math.max(50, store.zoom - 10))
      } else if (event.key === '0') {
        event.preventDefault()
        store.setZoom(100)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeActiveFile])

  useEffect(() => {
    const openKeyboardShortcuts = () => setKeyboardShortcutsOpen(true)

    document.addEventListener(KEYBOARD_SHORTCUTS_OPEN_EVENT, openKeyboardShortcuts)
    return () => document.removeEventListener(KEYBOARD_SHORTCUTS_OPEN_EVENT, openKeyboardShortcuts)
  }, [])

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()

        const store = useEditorStore.getState()
        if (event.deltaY > 0) {
          store.setZoom(Math.max(50, store.zoom - 10))
        } else if (event.deltaY < 0) {
          store.setZoom(Math.min(300, store.zoom + 10))
        }
      }
    }

    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onAIOpenFallback = (event: Event) => {
      const customEvent = event as CustomEvent<EditorAIOpenDetail>

      queueMicrotask(() => {
        if (customEvent.defaultPrevented) return

        const state = useEditorStore.getState()
        const fallbackTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0] ?? null
        if (!fallbackTab) return

        const detail = customEvent.detail
        const intent = detail.intent ?? 'generate'
        const offset = getOffsetFromCursorPos(fallbackTab.content, state.cursorPos.line, state.cursorPos.col)
        const outputTarget = resolveAIOpenOutputTarget(intent, detail.outputTarget, false, state.aiDefaultWriteTarget)
        const context = buildAIContextPacket({
          tabId: fallbackTab.id,
          tabPath: fallbackTab.path,
          fileName: fallbackTab.name,
          content: fallbackTab.content,
          intent,
          outputTarget,
          anchorOffset: offset,
          selection: undefined,
        })
        const blockRange = resolveCurrentBlockRange(fallbackTab.content, offset) ?? {
          from: offset,
          to: offset,
        }
        const threadId = useAIStore.getState().getThreadId(fallbackTab.id, fallbackTab.path)

        useAIStore.getState().openComposer({
          source: detail.source,
          intent,
          scope: context.scope,
          outputTarget,
          prompt: detail.prompt ?? '',
          context,
          draftText: '',
          explanationText: '',
          diffBaseText: outputTarget === 'replace-current-block' ? context.currentBlock ?? null : null,
          threadId,
          errorMessage: null,
          requestState: 'idle',
          startedAt: null,
          sourceSnapshot: {
            tabId: fallbackTab.id,
            selectionFrom: offset,
            selectionTo: offset,
            anchorOffset: offset,
            blockFrom: blockRange.from,
            blockTo: blockRange.to,
            docText: fallbackTab.content,
          },
        })
      })
    }

    document.addEventListener(EDITOR_AI_OPEN_EVENT, onAIOpenFallback)
    return () => document.removeEventListener(EDITOR_AI_OPEN_EVENT, onAIOpenFallback)
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

  const renderEditorPane = () => (
    <RecoverableErrorBoundary
      resetKeys={[activeTab?.id ?? '', viewMode, wysiwygMode]}
      renderFallback={({ reset }) => <ErrorFallback scope="surface" onRetry={reset} className="h-full" />}
    >
      <Suspense fallback={<EditorPlaceholder />}>
        <EditorPane />
      </Suspense>
    </RecoverableErrorBoundary>
  )

  const renderPreviewPane = () => (
    <RecoverableErrorBoundary
      resetKeys={[activeTab?.id ?? '', activeTab?.path ?? '', activeThemeId, viewMode]}
      renderFallback={({ reset }) => <ErrorFallback scope="surface" onRetry={reset} className="h-full" />}
    >
      <Suspense fallback={<PreviewPlaceholder onActivate={() => setPreviewActivated(true)} />}>
        <MarkdownPreview />
      </Suspense>
    </RecoverableErrorBoundary>
  )

  const handleSidebarResize = useCallback(
    (delta: number) => {
      const currentWidth = useEditorStore.getState().sidebarWidth
      const width = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, currentWidth + delta))
      setSidebarWidth(width)
    },
    [setSidebarWidth]
  )

  const resetSidebarResize = useCallback(() => {
    setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)
  }, [setSidebarWidth])

  const handleSplitResize = useCallback(
    (delta: number, totalWidth: number) => {
      const currentRatio = useEditorStore.getState().editorRatio
      const nextRatio = Math.max(0.2, Math.min(0.8, currentRatio + delta / totalWidth))
      setEditorRatio(nextRatio)
    },
    [setEditorRatio]
  )

  const resetSplitResize = useCallback(() => {
    setEditorRatio(0.5)
  }, [setEditorRatio])

  return (
    <div
      className={`flex flex-col h-full w-full overflow-hidden${focusMode ? ' focus-mode' : ''}${typewriterMode ? ' typewriter-mode' : ''}`}
      style={appStyle}
    >
      {paletteMode && (
        <Suspense fallback={null}>
          <CommandPalette mode={paletteMode} onClose={closePalette} />
        </Suspense>
      )}
      {keyboardShortcutsOpen && (
        <Suspense fallback={null}>
          <KeyboardShortcutsDialog onClose={() => setKeyboardShortcutsOpen(false)} />
        </Suspense>
      )}
      {aiComposerOpen && (
        <Suspense fallback={null}>
          <AIComposer />
        </Suspense>
      )}

      {updateDialogOpen && (
        <Suspense fallback={null}>
          <UpdateAvailableDialog />
        </Suspense>
      )}
      <NotificationCenter />
      {externalMissingDialogOpen && (
        <Suspense fallback={null}>
          <ExternalMissingFileDialog />
        </Suspense>
      )}
      {externalConflictDialogOpen && (
        <Suspense fallback={null}>
          <ExternalFileConflictDialog />
        </Suspense>
      )}

      {isTauri && <TitleBar />}

      <div data-overlay-boundary="true" className="relative flex min-h-0 flex-1 flex-col">
        <div
          className="relative z-20 flex-shrink-0 px-3 pt-3 pb-2"
          style={{ minHeight: 'var(--toolbar-shell-height)' }}
        >
          {focusMode ? (
            <div className="flex h-12 items-center justify-end px-1">
              <div
                className="text-xs px-3 py-1 rounded-full pointer-events-none select-none opacity-60"
                style={{
                  background: 'color-mix(in srgb, var(--bg-secondary) 88%, transparent)',
                  color: 'var(--text-muted)',
                  border: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
                }}
              >
                {t('toolbar.focusMode')} · F11
              </div>
            </div>
          ) : (
            <div className="toolbar-scroll-shell">
              <Toolbar
                onOpenPalette={() => setPaletteMode('command')}
                onOpenShortcuts={() => setKeyboardShortcutsOpen(true)}
                shortcutsOpen={keyboardShortcutsOpen}
                saving={saving}
              />
            </div>
          )}
        </div>

        <div className="flex flex-1 min-h-0 px-3 pb-3">
          <div className="relative flex flex-1 min-h-0 min-w-0">
            {showSidebar && (
              <div className="relative z-10 flex min-h-0 flex-shrink-0 items-stretch">
                <div
                  className="flex min-h-0 flex-shrink-0 flex-col overflow-hidden"
                  style={{ width: resolvedSidebarWidth }}
                >
                  <Sidebar width={resolvedSidebarWidth} />
                </div>
                <ResizableDivider
                  variant="sidebar"
                  ariaLabel={t('layout.sidebarResizeHandle')}
                  hint={t('layout.resizeHint')}
                  ariaValueMin={SIDEBAR_MIN_WIDTH}
                  ariaValueMax={SIDEBAR_MAX_WIDTH}
                  ariaValueNow={resolvedSidebarWidth}
                  ariaValueText={t('layout.sidebarResizeValue', { width: resolvedSidebarWidth })}
                  onResize={handleSidebarResize}
                  onReset={resetSidebarResize}
                />
              </div>
            )}

            <div
              className="relative flex flex-1 min-w-0 flex-col overflow-hidden rounded-[28px] shadow-elegant"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
            >
              {!focusMode && <DocumentTabs />}

              {focusMode ? (
                <div className="flex-1 min-w-0 overflow-hidden flex items-start justify-center focus-mode-container h-full">
                  <div className="focus-mode-column h-full w-full">
                    {renderEditorPane()}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 min-h-0 min-w-0">
                  {showEditor && (
                    <div
                      className="min-h-0 flex-shrink-0 overflow-hidden"
                      style={{ width: showPreview ? `${editorRatio * 100}%` : '100%' }}
                    >
                      {renderEditorPane()}
                    </div>
                  )}

                  {showEditor && showPreview && (
                    <ResizableDivider
                      variant="pane"
                      ariaLabel={t('layout.splitResizeHandle')}
                      hint={t('layout.resizeHint')}
                      ariaValueMin={20}
                      ariaValueMax={80}
                      ariaValueNow={splitEditorPercent}
                      ariaValueText={t('layout.splitResizeValue', {
                        editor: splitEditorPercent,
                        preview: splitPreviewPercent,
                      })}
                      onResize={handleSplitResize}
                      onReset={resetSplitResize}
                    />
                  )}

                  {showPreview && (
                    <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                      {previewActivated ? (
                        renderPreviewPane()
                      ) : (
                        <PreviewPlaceholder onActivate={() => setPreviewActivated(true)} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {!focusMode && <StatusBar saving={saving} />}
    </div>
  )
}

function getOffsetFromCursorPos(content: string, line: number, col: number): number {
  const lines = content.split(/\r?\n/u)
  const safeLine = Math.min(Math.max(line, 1), Math.max(lines.length, 1))
  let offset = 0

  for (let index = 0; index < safeLine - 1; index += 1) {
    offset += (lines[index] ?? '').length + 1
  }

  const targetLine = lines[safeLine - 1] ?? ''
  return offset + Math.min(Math.max(col - 1, 0), targetLine.length)
}
