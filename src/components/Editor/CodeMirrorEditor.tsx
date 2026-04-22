import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Compartment, EditorState, EditorSelection, type Extension, type StateEffect } from '@codemirror/state'
import { isolateHistory, redo, undo } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import {
  buildCoreExtensions,
  buildLineNumberExtensions,
  buildPlaceholderExtensions,
  buildWordWrapExtensions,
} from './extensions'
import { collectMarkdownTableBlocks } from './tableBlockRanges.ts'
import {
  loadAutocompleteExtensions,
  loadMarkdownLanguageExtensions,
  loadSearchSupport,
  type SearchSupport,
} from './optionalFeatures'
import {
  isBlankLineBelowTableSelection,
} from './wysiwygTable.ts'
import AISelectionBubble from '../AI/AISelectionBubble'
import { applyFormat } from './formatCommands'
import { getFormatActionFromShortcut } from './formatShortcuts'
import {
  cancelAICompletion,
  isAIRuntimeAvailable,
  loadAIProviderState,
  runAICompletion,
} from '../../lib/ai/client.ts'
import {
  clearAIGhostText,
  createAIGhostTextExtensions,
  createAIGhostTextSnapshot,
  showAIGhostText,
  shouldKeepAIGhostText,
} from '../../lib/ai/ghostText.ts'
import {
  createAIProvenanceAddEffect,
  createAIProvenanceExtensions,
  createAIProvenanceMark,
  readAIProvenanceMarks,
  setAIProvenanceMarks,
} from '../../lib/ai/provenance.ts'
import { buildAIContextPacket, resolveCurrentBlockRange } from '../../lib/ai/context.ts'
import { isAIApplySnapshotStale, resolveAIApplyChange } from '../../lib/ai/apply.ts'
import {
  EDITOR_AI_APPLY_EVENT,
  EDITOR_AI_GHOST_TEXT_EVENT,
  EDITOR_AI_OPEN_EVENT,
  type EditorAIApplyDetail,
  type EditorAIGhostTextDetail,
  type EditorAIOpenDetail,
} from '../../lib/ai/events.ts'
import { matchAISlashCommandQuery } from '../../lib/ai/slashCommands.ts'
import { buildAISlashCommandContext } from '../../lib/ai/slashCommands.ts'
import { resolveAIOpenOutputTarget, resolveAISelectedTextRole } from '../../lib/ai/opening.ts'
import {
  DEFAULT_AI_SELECTION_BUBBLE_SIZE,
  computeAISelectionBubblePosition,
  type SelectionBubbleSize,
} from '../../lib/ai/selectionBubble.ts'
import { buildAIRequestMessages, normalizeAIDraftText } from '../../lib/ai/prompt.ts'
import { isAIProviderConnectionReady } from '../../lib/ai/provider.ts'
import { clipboardHasType, readClipboardStringBestEffort } from '../../lib/clipboard'
import {
  buildMarkdownSafeClipboardPayload,
  writeClipboardEventPayload,
  writeClipboardPayload,
} from '../../lib/clipboardHtml'
import { getImageAltText } from '../../lib/fileTypes'
import {
  getTauriFilePersistence,
  persistDraftImageFilesAsMarkdown,
  persistImageFilesAsMarkdown,
} from '../../lib/documentPersistence'
import { prepareImageMarkdownInsertion } from '../../lib/imageMarkdownInsertion'
import { prepareMarkdownInsertion } from '../../lib/markdownInsertion'
import { resolveSafeEditorInsertion } from '../../lib/editorInsertion.ts'
import { appendEditorSelectionScrollEffect, keepEditorCursorBottomGap } from '../../lib/editorScroll.ts'
import {
  hasTerminalBlankLine,
  shouldInsertTerminalBlankLineOnArrowDown,
  shouldInsertTerminalBlankLineOnClickBelowDocumentEnd,
} from '../../lib/editorTerminalBlankLine.ts'
import { convertClipboardHtmlToMarkdown } from '../../lib/pasteHtml'
import { pushErrorNotice, pushInfoNotice } from '../../lib/notices'
import {
  primeAIUndoHistorySnapshot,
  restoreEditorStateSnapshot,
  saveEditorStateSnapshot,
} from '../../lib/editorStateCache.ts'
import {
  EDITOR_HISTORY_EVENT,
  type EditorHistoryAction,
  type EditorHistoryDetail,
  isTextInputLikeTarget,
  matchesEditorRedoShortcut,
  matchesEditorUndoShortcut,
} from '../../lib/editorHistory.ts'
import { useAIStore } from '../../store/ai'
import { useActiveTab, useEditorStore } from '../../store/editor'
import SearchBar from '../Search/SearchBar'

interface Props {
  content: string
  onChange: (content: string) => void
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const AI_GHOST_TEXT_PROMPT_KEY = 'ai.templates.ghostTextPrompt'
interface AIComposerRestoreSnapshot {
  selection: EditorSelection
  scrollTop: number
  scrollLeft: number
}

export default function CodeMirrorEditor({ content, onChange }: Props) {
  const { t } = useTranslation()
  const aiComposerOpen = useAIStore((state) => state.composer.open)
  const typewriterMode = useEditorStore((state) => state.typewriterMode)
  const shellRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const previousAIComposerOpenRef = useRef(aiComposerOpen)
  const aiComposerRestoreSnapshotRef = useRef<AIComposerRestoreSnapshot | null>(null)
  const isUpdatingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const typewriterModeRef = useRef(typewriterMode)
  const ghostTextRequestIdRef = useRef<string | null>(null)
  const ghostTextRunIdRef = useRef(0)
  const ghostTextSnapshotRef = useRef<{ docText: string; anchor: number } | null>(null)
  const autocompleteModulePromiseRef = useRef<Promise<typeof import('@codemirror/autocomplete')> | null>(null)
  const selectionBubbleSizeRef = useRef<SelectionBubbleSize>(DEFAULT_AI_SELECTION_BUBBLE_SIZE)
  const searchPromiseRef = useRef<Promise<SearchSupport> | null>(null)
  const autocompletePromiseRef = useRef<Promise<Extension[]> | null>(null)
  const markdownLanguagePromiseRef = useRef<Promise<Extension[]> | null>(null)
  const lineNumbersCompartmentRef = useRef(new Compartment())
  const wordWrapCompartmentRef = useRef(new Compartment())
  const placeholderCompartmentRef = useRef(new Compartment())
  const languageCompartmentRef = useRef(new Compartment())
  const searchCompartmentRef = useRef(new Compartment())
  const autocompleteCompartmentRef = useRef(new Compartment())
  const wysiwygCompartmentRef = useRef(new Compartment())
  const footnoteHoverCompartmentRef = useRef(new Compartment())

  const lineNumbers = useEditorStore((state) => state.lineNumbers)
  const wordWrap = useEditorStore((state) => state.wordWrap)
  const fontSize = useEditorStore((state) => state.fontSize)
  const wysiwygMode = useEditorStore((state) => state.wysiwygMode)
  const pendingNavigation = useEditorStore((state) => state.pendingNavigation)
  const setPendingNavigation = useEditorStore((state) => state.setPendingNavigation)
  const setCursorPos = useEditorStore((state) => state.setCursorPos)
  const aiDefaultWriteTarget = useEditorStore((state) => state.aiDefaultWriteTarget)
  const aiDefaultSelectedTextRole = useEditorStore((state) => state.aiDefaultSelectedTextRole)
  const activeTab = useActiveTab()
  const setProvenanceMarks = useAIStore((state) => state.setProvenanceMarks)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchReplace, setSearchReplace] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchSupport, setSearchSupport] = useState<SearchSupport | null>(null)
  const [markdownLanguageExtensions, setMarkdownLanguageExtensions] = useState<Extension[]>([])
  const [footnoteHoverExtension, setFootnoteHoverExtension] = useState<Extension[]>([])
  const [autocompleteExtensions, setAutocompleteExtensions] = useState<Extension[]>([])
  const [wysiwygExtensions, setWysiwygExtensions] = useState<Extension[]>([])
  const [selectionBubble, setSelectionBubble] = useState<{ top: number; left: number } | null>(null)

  const handleCursorChange = useCallback(
    (line: number, col: number) => {
      setCursorPos({ line, col })
    },
    [setCursorPos]
  )

  const hideSelectionBubble = useCallback(() => {
    setSelectionBubble(null)
  }, [])

  const updateSelectionBubble = useCallback(
    (viewOverride?: EditorView | null) => {
      const view = viewOverride ?? viewRef.current
      const shell = shellRef.current
      if (!view || !shell || aiComposerOpen) {
        clearGhostTextState(view)
        setSelectionBubble(null)
        return
      }

      const selection = view.state.selection.main
      if (view.state.selection.ranges.length !== 1 || selection.empty) {
        setSelectionBubble(null)
        return
      }

      const anchorCoords = view.coordsAtPos(selection.head)
      if (!anchorCoords) {
        setSelectionBubble(null)
        return
      }

      const wrapperRect = shell.getBoundingClientRect()
      const position = computeAISelectionBubblePosition(anchorCoords, {
        top: wrapperRect.top,
        bottom: wrapperRect.bottom,
        left: wrapperRect.left,
        right: wrapperRect.right,
      }, selectionBubbleSizeRef.current)

      setSelectionBubble(position)
    },
    [aiComposerOpen]
  )

  const selectionBubbleRafRef = useRef<number | null>(null)
  const selectionBubblePendingViewRef = useRef<EditorView | null | undefined>(undefined)

  const scheduleSelectionBubbleUpdate = useCallback(
    (viewOverride?: EditorView | null) => {
      selectionBubblePendingViewRef.current = viewOverride
      if (selectionBubbleRafRef.current !== null) return
      selectionBubbleRafRef.current = requestAnimationFrame(() => {
        selectionBubbleRafRef.current = null
        const pendingView = selectionBubblePendingViewRef.current
        selectionBubblePendingViewRef.current = undefined
        updateSelectionBubble(pendingView)
      })
    },
    [updateSelectionBubble]
  )

  useEffect(() => {
    return () => {
      if (selectionBubbleRafRef.current !== null) {
        cancelAnimationFrame(selectionBubbleRafRef.current)
        selectionBubbleRafRef.current = null
      }
    }
  }, [])

  const handleSelectionBubbleSizeChange = useCallback(
    (nextSize: SelectionBubbleSize) => {
      const previousSize = selectionBubbleSizeRef.current
      const widthChanged = Math.abs(previousSize.width - nextSize.width) > 0.5
      const heightChanged = Math.abs(previousSize.height - nextSize.height) > 0.5

      if (!widthChanged && !heightChanged) return

      selectionBubbleSizeRef.current = nextSize
      updateSelectionBubble()
    },
    [updateSelectionBubble]
  )

  const restoreAIComposerEditorContext = useCallback(
    (view: EditorView, snapshot: AIComposerRestoreSnapshot | null) => {
      const applyRestore = () => {
        if (viewRef.current !== view) return

        if (snapshot) {
          view.dispatch({ selection: snapshot.selection })
          view.scrollDOM.scrollTop = snapshot.scrollTop
          view.scrollDOM.scrollLeft = snapshot.scrollLeft
        }
        view.focus()
        updateSelectionBubble(view)
      }

      applyRestore()
      requestAnimationFrame(() => requestAnimationFrame(applyRestore))
    },
    [updateSelectionBubble]
  )

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    typewriterModeRef.current = typewriterMode
  }, [typewriterMode])

  const clearGhostTextState = useCallback((viewOverride?: EditorView | null) => {
    const view = viewOverride ?? viewRef.current
    if (!view) return
    clearAIGhostText(view)
    ghostTextSnapshotRef.current = null
  }, [])

  const cancelGhostTextRequest = useCallback(
    async (options: { clear?: boolean } = {}) => {
      const requestId = ghostTextRequestIdRef.current
      ghostTextRunIdRef.current += 1
      ghostTextRequestIdRef.current = null

      if (options.clear !== false) {
        clearGhostTextState()
      }

      if (!requestId) return
      try {
        await cancelAICompletion(requestId)
      } catch {
        // Ignore transport-level cancellation failures.
      }
    },
    [clearGhostTextState]
  )

  const syncGhostTextState = useCallback(
    (viewOverride?: EditorView | null) => {
      const view = viewOverride ?? viewRef.current
      const snapshot = ghostTextSnapshotRef.current
      if (!view || !snapshot) return

      if (shouldKeepAIGhostText(view, snapshot.docText, snapshot.anchor)) return

      void cancelGhostTextRequest()
    },
    [cancelGhostTextRequest]
  )

  const syncProvenanceState = useCallback(
    (viewOverride?: EditorView | null, tabIdOverride?: string | null) => {
      const view = viewOverride ?? viewRef.current
      const tabId = tabIdOverride ?? activeTab?.id ?? null
      if (!view || !tabId) return

      setProvenanceMarks(tabId, readAIProvenanceMarks(view))
    },
    [activeTab?.id, setProvenanceMarks]
  )

  const syncCursorBottomGap = useCallback(
    (viewOverride?: EditorView | null, isPointerEvent?: boolean) => {
      const view = viewOverride ?? viewRef.current
      if (!view || !view.hasFocus || typewriterModeRef.current || isPointerEvent) return
      keepEditorCursorBottomGap(view)
    },
    []
  )

  const scheduleTableExitFocusRestore = useCallback((viewOverride?: EditorView | null) => {
    const view = viewOverride ?? viewRef.current
    if (!view) return

    setTimeout(() => {
      if (!view.dom.isConnected) return

      const doc = view.dom.ownerDocument
      if (doc.activeElement !== doc.body) return

      const selection = view.state.selection.main
      if (view.state.selection.ranges.length !== 1 || !selection.empty) return

      const tables = collectMarkdownTableBlocks(view.state.doc.toString())
      if (!isBlankLineBelowTableSelection(view.state.doc, tables, selection.head)) return

      view.focus()
    }, 0)
  }, [])

  const insertTerminalBlankLine = useCallback((viewOverride?: EditorView | null): boolean => {
    const view = viewOverride ?? viewRef.current
    if (!view) return false
    if (hasTerminalBlankLine(view.state.doc)) return false

    const activeElement = view.dom.ownerDocument.activeElement
    if (activeElement instanceof HTMLInputElement && view.dom.contains(activeElement)) {
      activeElement.blur()
    }

    const docLength = view.state.doc.length
    insertMarkdown(
      view,
      '\n',
      { from: docLength, to: docLength },
      {
        selectionAnchor: docLength + 1,
        userEvent: 'input',
      }
    )
    view.focus()
    return true
  }, [])

  const reconfigure = useCallback((compartment: Compartment, extension: Extension) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: compartment.reconfigure(extension) })
  }, [])

  const runHistoryAction = useCallback(
    (action: EditorHistoryAction): boolean => {
      const view = viewRef.current
      if (!view) return false

      const command = action === 'redo' ? redo : undo
      const didRun = command(view)
      if (!didRun) return false

      syncGhostTextState(view)
      syncProvenanceState(view)
      updateSelectionBubble(view)
      view.focus()
      return true
    },
    [syncGhostTextState, syncProvenanceState, updateSelectionBubble]
  )

  const ensureSearchSupport = useCallback(async () => {
    if (searchSupport) return searchSupport

    searchPromiseRef.current ??= loadSearchSupport().then((support) => {
      setSearchSupport(support)
      return support
    })

    return searchPromiseRef.current
  }, [searchSupport])

  const ensureAutocompleteExtensions = useCallback(async () => {
    if (autocompleteExtensions.length > 0) return autocompleteExtensions

    autocompletePromiseRef.current ??= loadAutocompleteExtensions().then((extensions) => {
      setAutocompleteExtensions(extensions)
      return extensions
    })

    return autocompletePromiseRef.current
  }, [autocompleteExtensions])

  const ensureAutocompleteModule = useCallback(async () => {
    autocompleteModulePromiseRef.current ??= import('@codemirror/autocomplete')
    return autocompleteModulePromiseRef.current
  }, [])

  const ensureMarkdownLanguageExtensions = useCallback(async () => {
    if (markdownLanguageExtensions.length > 0) return markdownLanguageExtensions

    markdownLanguagePromiseRef.current ??= loadMarkdownLanguageExtensions().then((extensions) => {
      setMarkdownLanguageExtensions(extensions)
      return extensions
    })

    return markdownLanguagePromiseRef.current
  }, [markdownLanguageExtensions])

  const openSearchPanel = useCallback(
    (replace: boolean) => {
      setSearchOpen(true)
      setSearchReplace(replace)
      setSearchLoading(true)
      void ensureSearchSupport().finally(() => setSearchLoading(false))
    },
    [ensureSearchSupport]
  )

  useEffect(() => {
    if (!wysiwygMode) {
      setWysiwygExtensions([])
      return
    }

    let cancelled = false
    void import('./wysiwyg').then(({ wysiwygPlugin, wysiwygTheme, wysiwygTableDecorations }) => {
      if (!cancelled) setWysiwygExtensions([wysiwygTableDecorations, wysiwygPlugin, wysiwygTheme])
    })

    return () => {
      cancelled = true
    }
  }, [wysiwygMode])

  useEffect(() => {
    let cancelled = false
    import('./wysiwygFootnoteHover').then(({ wysiwygFootnoteHoverTooltip }) => {
      if (!cancelled) setFootnoteHoverExtension([wysiwygFootnoteHoverTooltip])
    })

    return () => {
      cancelled = true
    }
  }, [])



  useEffect(() => {
    const container = containerRef.current
    const tabId = activeTab?.id
    if (!container || viewRef.current || !tabId) return

    const scheduleAutocompleteStart = (callback: () => void) => {
      setTimeout(callback, 0)
    }

    const extensions = [
      ...buildCoreExtensions({
        onChange: (nextContent: string) => {
          if (!isUpdatingRef.current) onChangeRef.current(nextContent)
        },
        onCursorChange: handleCursorChange,
        onSelectionChange: (view, update) => {
          syncGhostTextState(view)
          syncProvenanceState(view)
          const isPointerEvent = update?.transactions.some((tr) => tr.isUserEvent('select.pointer'))
          syncCursorBottomGap(view, isPointerEvent)
          scheduleSelectionBubbleUpdate(view)
          scheduleTableExitFocusRestore(view)
        },
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        if (useAIStore.getState().composer.open) return

        const selection = update.state.selection.main
        if (update.state.selection.ranges.length !== 1 || !selection.empty) return

        const line = update.state.doc.lineAt(selection.head)
        const before = line.text.slice(0, selection.head - line.from)
        if (!matchAISlashCommandQuery(before)) return

        scheduleAutocompleteStart(() => {
          const activeView = viewRef.current
          if (!activeView || !activeView.dom.isConnected) return
          void ensureAutocompleteExtensions()
            .then((extensions) => {
              const currentView = viewRef.current
              if (!currentView || !currentView.dom.isConnected) return null
              reconfigure(autocompleteCompartmentRef.current, extensions)
              return ensureAutocompleteModule()
            })
            .then((autocomplete) => {
              const currentView = viewRef.current
              if (!autocomplete) return
              if (!currentView || !currentView.dom.isConnected) return
              if (useAIStore.getState().composer.open) return
              currentView.focus()
              autocomplete.closeCompletion(currentView)
              autocomplete.startCompletion(currentView)
            })
        })
      }),
      lineNumbersCompartmentRef.current.of(lineNumbers ? buildLineNumberExtensions() : []),
      wordWrapCompartmentRef.current.of(buildWordWrapExtensions(wordWrap)),
      placeholderCompartmentRef.current.of(buildPlaceholderExtensions(t('placeholder'))),
      languageCompartmentRef.current.of(markdownLanguageExtensions),
      searchCompartmentRef.current.of(searchSupport?.extensions ?? []),
      autocompleteCompartmentRef.current.of(autocompleteExtensions),
      ...createAIGhostTextExtensions(),
      ...createAIProvenanceExtensions(),
      wysiwygCompartmentRef.current.of(wysiwygExtensions),
      footnoteHoverCompartmentRef.current.of(footnoteHoverExtension),
    ]

    const state =
      restoreEditorStateSnapshot({
        tabId,
        content,
        extensions,
      }) ??
      EditorState.create({
        doc: content,
        extensions,
      })

    const view = new EditorView({ state, parent: container })
    viewRef.current = view
    view.focus()
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    handleCursorChange(line.number, cursor - line.from + 1)
    updateSelectionBubble(view)

    return () => {
      saveEditorStateSnapshot(tabId, view.state)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, handleCursorChange, scheduleTableExitFocusRestore, t])

  useEffect(() => {
    void ensureAutocompleteExtensions()
  }, [ensureAutocompleteExtensions])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const handleFocus = () => {
      void ensureAutocompleteExtensions()
    }

    view.dom.addEventListener('focusin', handleFocus)
    return () => {
      view.dom.removeEventListener('focusin', handleFocus)
    }
  }, [ensureAutocompleteExtensions])

  useEffect(() => {
    void ensureMarkdownLanguageExtensions()
  }, [ensureMarkdownLanguageExtensions])

  useEffect(() => {
    reconfigure(lineNumbersCompartmentRef.current, lineNumbers ? buildLineNumberExtensions() : [])
  }, [lineNumbers, reconfigure])

  useEffect(() => {
    reconfigure(wordWrapCompartmentRef.current, buildWordWrapExtensions(wordWrap))
  }, [reconfigure, wordWrap])

  useEffect(() => {
    reconfigure(placeholderCompartmentRef.current, buildPlaceholderExtensions(t('placeholder')))
  }, [reconfigure, t])

  useEffect(() => {
    reconfigure(languageCompartmentRef.current, markdownLanguageExtensions)
  }, [markdownLanguageExtensions, reconfigure])

  useEffect(() => {
    reconfigure(searchCompartmentRef.current, searchSupport?.extensions ?? [])
  }, [reconfigure, searchSupport])

  useEffect(() => {
    reconfigure(autocompleteCompartmentRef.current, autocompleteExtensions)
  }, [autocompleteExtensions, reconfigure])

  useEffect(() => {
    if (!aiComposerOpen) return
    reconfigure(autocompleteCompartmentRef.current, [])
  }, [aiComposerOpen, reconfigure])

  useEffect(() => {
    reconfigure(wysiwygCompartmentRef.current, wysiwygExtensions)
  }, [reconfigure, wysiwygExtensions])

  useEffect(() => {
    reconfigure(footnoteHoverCompartmentRef.current, footnoteHoverExtension)
  }, [reconfigure, footnoteHoverExtension])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const current = view.state.doc.toString()
    if (current === content) return

    isUpdatingRef.current = true
    view.dispatch({ changes: { from: 0, to: current.length, insert: content } })
    isUpdatingRef.current = false
    syncGhostTextState(view)
    syncProvenanceState(view)
    updateSelectionBubble(view)
  }, [content, syncGhostTextState, syncProvenanceState, updateSelectionBubble])

  useEffect(() => {
    if (!typewriterMode) return

    const view = viewRef.current
    if (!view) return

    const dom = view.scrollDOM
    const onSelectionChange = () => {
      const selection = view.state.selection.main.head
      const coords = view.coordsAtPos(selection)
      if (!coords) return

      const middle = dom.getBoundingClientRect().top + dom.clientHeight / 2
      dom.scrollTop += coords.top - middle
    }

    view.dom.addEventListener('keyup', onSelectionChange)
    view.dom.addEventListener('click', onSelectionChange)
    return () => {
      view.dom.removeEventListener('keyup', onSelectionChange)
      view.dom.removeEventListener('click', onSelectionChange)
    }
  }, [typewriterMode])

  useEffect(() => {
    updateSelectionBubble()
    clearGhostTextState()
  }, [activeTab?.id, aiComposerOpen, clearGhostTextState, updateSelectionBubble])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !activeTab) return

    const marks = useAIStore.getState().getProvenanceMarks(activeTab.id)
    setAIProvenanceMarks(view, marks)
  }, [activeTab?.id])

  useEffect(() => {
    const view = viewRef.current
    const wasComposerOpen = previousAIComposerOpenRef.current
    previousAIComposerOpenRef.current = aiComposerOpen

    if (!view) return

    if (!wasComposerOpen || aiComposerOpen) return

    const restoreSnapshot = aiComposerRestoreSnapshotRef.current
    aiComposerRestoreSnapshotRef.current = null

    reconfigure(autocompleteCompartmentRef.current, autocompleteExtensions)
    syncGhostTextState(view)
    restoreAIComposerEditorContext(view, restoreSnapshot)
  }, [aiComposerOpen, autocompleteExtensions, reconfigure, restoreAIComposerEditorContext, syncGhostTextState])

  useEffect(() => {
    const handler = (event: Event) => {
      const view = viewRef.current
      if (!view) return

      const action = (event as CustomEvent).detail as string
      applyFormat(view, action as Parameters<typeof applyFormat>[1])
    }

    document.addEventListener('editor:format', handler)
    return () => document.removeEventListener('editor:format', handler)
  }, [])

  useEffect(() => {
    const onHistoryRequested = (event: Event) => {
      const detail = (event as CustomEvent<EditorHistoryDetail>).detail
      runHistoryAction(detail.action)
    }

    document.addEventListener(EDITOR_HISTORY_EVENT, onHistoryRequested)
    return () => document.removeEventListener(EDITOR_HISTORY_EVENT, onHistoryRequested)
  }, [runHistoryAction])

  useEffect(() => {
    const onGlobalHistoryShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      const action = matchesEditorUndoShortcut(event)
        ? 'undo'
        : matchesEditorRedoShortcut(event)
          ? 'redo'
          : null
      if (!action) return

      const view = viewRef.current
      if (!view) return

      const target = event.target
      if (target instanceof Node && view.dom.contains(target)) return
      if (isTextInputLikeTarget(target)) return

      event.preventDefault()
      runHistoryAction(action)
    }

    document.addEventListener('keydown', onGlobalHistoryShortcut)
    return () => document.removeEventListener('keydown', onGlobalHistoryShortcut)
  }, [runHistoryAction])

  useEffect(() => {
    const onFormatShortcut = (event: KeyboardEvent) => {
      const action = getFormatActionFromShortcut(event)
      if (!action) return

      const view = viewRef.current
      if (!view) return

      const target = event.target
      if (!(target instanceof Node) || !view.dom.contains(target)) return

      event.preventDefault()
      applyFormat(view, action)
    }

    document.addEventListener('keydown', onFormatShortcut, true)
    return () => document.removeEventListener('keydown', onFormatShortcut, true)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key === 'f') {
        event.preventDefault()
        openSearchPanel(false)
        return
      }
      if (mod && event.key === 'h') {
        event.preventDefault()
        openSearchPanel(true)
        return
      }
      if (event.key === 'Escape' && searchOpen) {
        event.preventDefault()
        setSearchOpen(false)
      }
    }

    const onSearchRequested = (event: Event) => {
      const detail = (event as CustomEvent).detail as { replace: boolean }
      openSearchPanel(detail.replace)
    }

    const onSearchCloseRequested = () => {
      setSearchOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('editor:search', onSearchRequested)
    document.addEventListener('editor:search-close', onSearchCloseRequested)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('editor:search', onSearchRequested)
      document.removeEventListener('editor:search-close', onSearchCloseRequested)
    }
  }, [openSearchPanel, searchOpen])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !searchSupport) return

    if (searchOpen) {
      searchSupport.openPanel(view)
    } else {
      searchSupport.closePanel(view)
    }
  }, [searchOpen, searchSupport])

  useEffect(() => {
    if (!pendingNavigation || pendingNavigation.tabId !== activeTab?.id) return

    const view = viewRef.current
    if (!view) return

    const lineNumber = Math.max(1, Math.min(pendingNavigation.line, view.state.doc.lines))
    const line = view.state.doc.line(lineNumber)
    const column = Math.max(1, pendingNavigation.column ?? 1)
    const anchor = Math.min(line.to, line.from + column - 1)
    const align = pendingNavigation.align ?? 'center'

    view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, {
        y: align,
        yMargin: align === 'start' ? 20 : 5,
      }),
    })
    view.focus()
    setPendingNavigation(null)
  }, [activeTab?.id, pendingNavigation, setPendingNavigation])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleArrowDownToTerminalBlankLine = (event: KeyboardEvent) => {
      const view = viewRef.current
      if (!view) return

      if (event.key !== 'ArrowDown') return
      if (event.isComposing || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.target instanceof HTMLInputElement && view.dom.contains(event.target)) return

      const selection = view.state.selection.main
      const line = view.state.doc.lineAt(selection.head)
      if (!shouldInsertTerminalBlankLineOnArrowDown({
        hasSingleCursor: view.state.selection.ranges.length === 1,
        selectionEmpty: selection.empty,
        selectionLineNumber: line.number,
        docLineCount: view.state.doc.lines,
        hasTerminalBlankLine: hasTerminalBlankLine(view.state.doc),
      })) {
        return
      }

      event.preventDefault()
      insertTerminalBlankLine(view)
    }

    const handleClickBelowDocumentEnd = (event: MouseEvent) => {
      const view = viewRef.current
      if (!view) return

      if (event.button !== 0) return
      if (event.shiftKey) return

      const target = event.target
      if (!(target instanceof Node) || !view.scrollDOM.contains(target)) return

      const documentEndCoords = view.coordsAtPos(view.state.doc.length)
      if (!documentEndCoords) return

      if (!shouldInsertTerminalBlankLineOnClickBelowDocumentEnd({
        clickY: event.clientY,
        documentEndBottom: documentEndCoords.bottom,
        hasTerminalBlankLine: hasTerminalBlankLine(view.state.doc),
      })) {
        return
      }

      event.preventDefault()
      insertTerminalBlankLine(view)
    }

    container.addEventListener('keydown', handleArrowDownToTerminalBlankLine, true)
    container.addEventListener('mousedown', handleClickBelowDocumentEnd, true)
    return () => {
      container.removeEventListener('keydown', handleArrowDownToTerminalBlankLine, true)
      container.removeEventListener('mousedown', handleClickBelowDocumentEnd, true)
    }
  }, [insertTerminalBlankLine])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleCopy = (event: ClipboardEvent) => {
      void handleCopyOrCut(event, 'copy')
    }

    const handleCut = (event: ClipboardEvent) => {
      void handleCopyOrCut(event, 'cut')
    }

    const handlePaste = async (event: ClipboardEvent) => {
      const view = viewRef.current
      if (!view) return

      const clipboardApi = typeof navigator === 'object' ? navigator.clipboard : null
      const resolveActivePasteView = (): EditorView | null => {
        const currentView = viewRef.current
        if (!currentView || currentView !== view || !currentView.dom.isConnected) return null
        return currentView
      }

      const queuePasteCursorBottomGapSync = () => {
        setTimeout(() => {
          if (viewRef.current !== view || !view.dom.isConnected) return
          keepEditorCursorBottomGap(view, { force: true })
        }, 0)
      }

      const clipboardData = event.clipboardData
      const items = clipboardData?.items
      const hasHtml = clipboardHasType(clipboardData, 'text/html')

      event.preventDefault()
      event.stopPropagation()

      if (hasHtml) {
        const html = await readClipboardStringBestEffort(clipboardData, 'text/html', clipboardApi)
        const plainText = await readClipboardStringBestEffort(clipboardData, 'text/plain', clipboardApi)
        const markdownText = convertClipboardHtmlToMarkdown(html, plainText)
        if (markdownText) {
          const activeView = resolveActivePasteView()
          if (!activeView) return
          replaceSelectionWithMarkdown(activeView, markdownText)
          queuePasteCursorBottomGapSync()
          return
        }

        if (plainText) {
          const activeView = resolveActivePasteView()
          if (!activeView) return
          replaceSelectionWithMarkdown(activeView, plainText)
          queuePasteCursorBottomGapSync()
          return
        }
      }

      if (items) {
        const imageFiles = Array.from(items)
          .filter((item) => item.type.startsWith('image/'))
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)

        if (imageFiles.length > 0) {
          try {
            const markdownText = await buildImageMarkdown(
              imageFiles,
              activeTab?.path ?? null,
              activeTab?.id ?? null
            )
            if (!markdownText) return
            const activeView = resolveActivePasteView()
            if (!activeView) return
            replaceSelectionWithImageMarkdown(activeView, markdownText)
            queuePasteCursorBottomGapSync()
          } catch (error) {
            console.error('Persist pasted image error:', error)
          }
          return
        }
      }

      const plainText = await readClipboardStringBestEffort(clipboardData, 'text/plain', clipboardApi)

      if (plainText) {
        const activeView = resolveActivePasteView()
        if (!activeView) return
        replaceSelectionWithMarkdown(activeView, plainText)
        queuePasteCursorBottomGapSync()
      }
    }

    const handleCopyOrCut = async (event: ClipboardEvent, mode: 'copy' | 'cut') => {
      const view = viewRef.current
      if (!view) return

      const target = event.target
      if (!(target instanceof Node) || !view.dom.contains(target)) return
      if (view.state.selection.ranges.length !== 1) return

      const selection = view.state.selection.main
      if (selection.empty) return

      const markdownText = view.state.sliceDoc(selection.from, selection.to)
      const payload = buildMarkdownSafeClipboardPayload(markdownText)
      const fallbackCopied = writeClipboardEventPayload(event, payload)
      event.preventDefault()

      const applyCut = () => {
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: '' },
          selection: { anchor: selection.from },
        })
      }

      if (mode === 'cut' && fallbackCopied) {
        applyCut()
      }

      if (fallbackCopied) return

      try {
        await writeClipboardPayload(payload)

        if (mode === 'cut') {
          applyCut()
        }
      } catch (error) {
        if (!fallbackCopied) {
          console.error(`${mode} clipboard write error:`, error)
        }
      }
    }

    container.addEventListener('copy', handleCopy)
    container.addEventListener('cut', handleCut)
    // Capture paste before CodeMirror's own bubbling handlers consume the flattened plain-text payload.
    container.addEventListener('paste', handlePaste, true)
    return () => {
      container.removeEventListener('copy', handleCopy)
      container.removeEventListener('cut', handleCut)
      container.removeEventListener('paste', handlePaste, true)
    }
  }, [activeTab?.id, activeTab?.path])

  useEffect(() => {
    const handleAIOpen = (event: Event) => {
      const view = viewRef.current
      if (!view || !activeTab) return

      event.preventDefault()
      const detail = (event as CustomEvent<EditorAIOpenDetail>).detail
      const selection = view.state.selection.main
      const hasSelection = !selection.empty
      const intent = detail.intent ?? (hasSelection ? 'edit' : 'generate')
      const requestedScope = detail.scope
      const requestedOutputTarget = detail.outputTarget
      const outputTarget = resolveAIOpenOutputTarget(
        intent,
        requestedOutputTarget,
        hasSelection,
        aiDefaultWriteTarget
      )
      const snapshot = createAIApplySnapshot(view, activeTab.id)
      let context = buildAIContextPacket({
        tabId: activeTab.id,
        tabPath: activeTab.path,
        fileName: activeTab.name,
        content: snapshot.docText,
        intent,
        scope: requestedScope,
        outputTarget,
        anchorOffset: snapshot.anchorOffset,
        selection: hasSelection
          ? {
              from: snapshot.selectionFrom,
              to: snapshot.selectionTo,
              role: resolveAISelectedTextRole(detail.selectedTextRole, aiDefaultSelectedTextRole),
            }
          : undefined,
      })
      const finalOutputTarget = outputTarget
      const finalScope = context.scope

      if (finalOutputTarget !== outputTarget || finalScope !== context.scope) {
        context = {
          ...context,
          outputTarget: finalOutputTarget,
          scope: finalScope,
        }
      }
      if (detail.source === 'slash-command') {
        context = {
          ...context,
          slashCommandContext: buildAISlashCommandContext(snapshot.docText, snapshot.anchorOffset),
        }
      }
      const threadId = useAIStore.getState().getThreadId(activeTab.id, activeTab.path)
      aiComposerRestoreSnapshotRef.current = {
        selection: view.state.selection,
        scrollTop: view.scrollDOM.scrollTop,
        scrollLeft: view.scrollDOM.scrollLeft,
      }

      useAIStore.getState().openComposer({
        source: detail.source,
        intent,
        scope: context.scope,
        outputTarget: context.outputTarget,
        prompt: detail.prompt ?? '',
        context,
        draftText: '',
        explanationText: '',
        diffBaseText:
          context.outputTarget === 'replace-selection'
            ? context.selectedText ?? null
            : context.outputTarget === 'replace-current-block'
              ? context.currentBlock ?? null
              : null,
        threadId,
        errorMessage: null,
        requestState: 'idle',
        startedAt: null,
        sourceSnapshot: snapshot,
      })
      setSelectionBubble(null)
    }

    const handleAIApply = (event: Event) => {
      const view = viewRef.current
      if (!view || !activeTab) return

      const detail = (event as CustomEvent<EditorAIApplyDetail>).detail
      if (detail.tabId !== activeTab.id) return
      const wasComposerOpen = useAIStore.getState().composer.open

      if (detail.outputTarget === 'new-note') {
        const tabId = useEditorStore.getState().addTab({
          name: t('app.untitled'),
          content: detail.text,
          savedContent: '',
          isDirty: true,
        })
        primeAIUndoHistorySnapshot({
          tabId,
          beforeContent: '',
          afterContent: detail.text,
        })
        const provenanceRange = detail.provenance
          ? resolveInsertedProvenanceRange(0, detail.text)
          : null
        if (detail.provenance && provenanceRange) {
          useAIStore.getState().setProvenanceMarks(tabId, [
            createAIProvenanceMark({
              from: provenanceRange.from,
              to: provenanceRange.to,
              badge: detail.provenance.badge,
              detail: detail.provenance.detail,
              kind: detail.provenance.kind,
              createdAt: detail.provenance.createdAt,
            }),
          ])
        }
        aiComposerRestoreSnapshotRef.current = null
        useAIStore.getState().closeComposer()
        setSelectionBubble(null)
        return
      }

      const currentDoc = view.state.doc.toString()
      if (isAIApplySnapshotStale(detail.snapshot, currentDoc)) {
        pushErrorNotice('notices.aiApplyConflictTitle', 'notices.aiApplyConflictMessage')
        return
      }

      const { range, text, selectionAnchor } = resolveAIApplyChange(
        detail.outputTarget,
        detail.snapshot,
        currentDoc,
        detail.text
      )
      const provenanceRange = detail.provenance
        ? resolveInsertedProvenanceRange(range.from, text)
        : null
      const effects = detail.provenance && provenanceRange
        ? [
            createAIProvenanceAddEffect(
              createAIProvenanceMark({
                from: provenanceRange.from,
                to: provenanceRange.to,
                badge: detail.provenance.badge,
                detail: detail.provenance.detail,
                kind: detail.provenance.kind,
                createdAt: detail.provenance.createdAt,
              })
            ),
          ]
        : undefined
      insertMarkdown(view, text, range, {
        isolateHistoryBoundary: true,
        userEvent: 'input.ai',
        effects,
        selectionAnchor,
      })
      syncProvenanceState(view, activeTab.id)
      aiComposerRestoreSnapshotRef.current = null
      useAIStore.getState().closeComposer()
      if (wasComposerOpen) view.focus()
      updateSelectionBubble(view)
    }

    const handleAIGhostText = (event: Event) => {
      const view = viewRef.current
      if (!view || !activeTab) return

      const detail = (event as CustomEvent<EditorAIGhostTextDetail>).detail
      void detail
      if (view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty) {
        pushInfoNotice('notices.aiGhostTextCursorOnlyTitle', 'notices.aiGhostTextCursorOnlyMessage')
        return
      }

      if (!isAIRuntimeAvailable()) {
        pushInfoNotice('notices.aiDesktopOnlyTitle', 'notices.aiDesktopOnlyMessage')
        return
      }

      const snapshot = createAIApplySnapshot(view, activeTab.id)
      const context = buildAIContextPacket({
        tabId: activeTab.id,
        tabPath: activeTab.path,
        fileName: activeTab.name,
        content: snapshot.docText,
        intent: 'generate',
        outputTarget: 'at-cursor',
        anchorOffset: snapshot.anchorOffset,
      })
      const prompt = t(AI_GHOST_TEXT_PROMPT_KEY)

      const runGhostText = async () => {
        const providerState = await loadAIProviderState()
        if (!isAIProviderConnectionReady(providerState)) {
          pushInfoNotice('notices.aiProviderMissingTitle', 'notices.aiProviderMissingMessage')
          return
        }

        await cancelGhostTextRequest()

        const runId = ghostTextRunIdRef.current + 1
        ghostTextRunIdRef.current = runId
        const requestId = `${activeTab.id}-ghost-${runId}-${Date.now()}`
        ghostTextRequestIdRef.current = requestId
        const createdAt = Date.now()
        ghostTextSnapshotRef.current = createAIGhostTextSnapshot(view)

        view.focus()
        showAIGhostText(view, {
          anchor: snapshot.anchorOffset,
          status: 'loading',
          text: '',
          badge: t('ai.provenance.badge'),
          detail: t('ai.provenance.ghostDetail'),
          createdAt,
        })

        let streamedText = ''

        try {
          const response = await runAICompletion(
            {
              requestId,
              intent: 'generate',
              scope: context.scope,
              outputTarget: 'at-cursor',
              prompt,
              context,
              messages: buildAIRequestMessages({
                prompt,
                context,
              }),
              executionTargetKind: 'direct-provider',
              invocationCapability: 'text-generation',
              knowledgeSelection: { kind: 'none' },
              threadId: null,
              hostedAgentProfileId: null,
            },
            {
              onChunk: (chunk) => {
                const activeView = viewRef.current
                if (
                  !activeView ||
                  runId !== ghostTextRunIdRef.current ||
                  ghostTextRequestIdRef.current !== requestId
                ) {
                  return
                }

                if (!shouldKeepAIGhostText(activeView, snapshot.docText, snapshot.anchorOffset)) {
                  void cancelGhostTextRequest()
                  return
                }

                streamedText += chunk
                showAIGhostText(activeView, {
                  anchor: snapshot.anchorOffset,
                  status: 'loading',
                  text: streamedText,
                  badge: t('ai.provenance.badge'),
                  detail: t('ai.provenance.ghostDetail'),
                  createdAt,
                })
              },
            }
          )

          const activeView = viewRef.current
          if (
            !activeView ||
            runId !== ghostTextRunIdRef.current ||
            ghostTextRequestIdRef.current !== requestId
          ) {
            return
          }

          ghostTextRequestIdRef.current = null

          if (!shouldKeepAIGhostText(activeView, snapshot.docText, snapshot.anchorOffset)) {
            clearGhostTextState(activeView)
            return
          }

          const ghostText = normalizeAIDraftText(response.text, 'at-cursor')
          if (!ghostText) {
            clearGhostTextState(activeView)
            return
          }

          activeView.focus()
          showAIGhostText(activeView, {
            anchor: snapshot.anchorOffset,
            status: 'ready',
            text: ghostText,
            badge: t('ai.provenance.badge'),
            detail: t('ai.provenance.ghostDetail'),
            createdAt,
          })
        } catch (error) {
          if (runId !== ghostTextRunIdRef.current) return
          ghostTextRequestIdRef.current = null
          clearGhostTextState()

          const message = error instanceof Error ? error.message : String(error)
          if (/canceled/u.test(message)) return

          pushErrorNotice('notices.aiRequestErrorTitle', 'notices.aiRequestErrorMessage', {
            values: { reason: message },
          })
        }
      }

      void runGhostText()
    }

    document.addEventListener(EDITOR_AI_OPEN_EVENT, handleAIOpen)
    document.addEventListener(EDITOR_AI_APPLY_EVENT, handleAIApply)
    document.addEventListener(EDITOR_AI_GHOST_TEXT_EVENT, handleAIGhostText)
    return () => {
      document.removeEventListener(EDITOR_AI_OPEN_EVENT, handleAIOpen)
      document.removeEventListener(EDITOR_AI_APPLY_EVENT, handleAIApply)
      document.removeEventListener(EDITOR_AI_GHOST_TEXT_EVENT, handleAIGhostText)
    }
  }, [
    activeTab,
    aiDefaultSelectedTextRole,
    aiDefaultWriteTarget,
    cancelGhostTextRequest,
    clearGhostTextState,
    setProvenanceMarks,
    syncProvenanceState,
    t,
    updateSelectionBubble,
  ])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = async (event: DragEvent) => {
      const view = viewRef.current
      if (!view) return

      const imageFiles = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith('image/'))
      if (imageFiles.length === 0) return

      event.preventDefault()
      event.stopPropagation()

      const dropPos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from
      try {
        const markdownText = await buildImageMarkdown(
          imageFiles,
          activeTab?.path ?? null,
          activeTab?.id ?? null
        )
        if (!markdownText) return
        insertImageMarkdown(view, markdownText, { from: dropPos, to: dropPos })
      } catch (error) {
        console.error('Persist dropped image error:', error)
      }
    }

    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('drop', handleDrop)
    return () => {
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('drop', handleDrop)
    }
  }, [activeTab?.id, activeTab?.path])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const handleScroll = () => scheduleSelectionBubbleUpdate(view)
    const handleBlur = () => hideSelectionBubble()
    const handleResize = () => scheduleSelectionBubbleUpdate(view)

    view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true })
    view.dom.addEventListener('focusout', handleBlur)
    window.addEventListener('resize', handleResize)
    return () => {
      view.scrollDOM.removeEventListener('scroll', handleScroll)
      view.dom.removeEventListener('focusout', handleBlur)
      window.removeEventListener('resize', handleResize)
    }
  }, [hideSelectionBubble, scheduleSelectionBubbleUpdate])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell || typeof ResizeObserver !== 'function') return

    const observer = new ResizeObserver(() => scheduleSelectionBubbleUpdate())
    observer.observe(shell)
    return () => observer.disconnect()
  }, [scheduleSelectionBubbleUpdate])

  useEffect(() => {
    return () => {
      void cancelGhostTextRequest()
    }
  }, [cancelGhostTextRequest])

  return (
    <div ref={shellRef} className="relative h-full flex flex-col overflow-hidden">
      {searchOpen && (
        <SearchBar
          editorView={viewRef.current}
          searchSupport={searchSupport}
          loading={searchLoading}
          showReplace={searchReplace}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {selectionBubble && (
        <AISelectionBubble
          top={selectionBubble.top}
          left={selectionBubble.left}
          onSizeChange={handleSelectionBubbleSizeChange}
        />
      )}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden transition-all duration-300"
        style={{
          fontSize: `${fontSize}px`,
        }}
      />
    </div>
  )
}

function replaceSelectionWithMarkdown(view: EditorView, markdownText: string): void {
  // Normalize \r\n and bare \r to \n. CodeMirror's internal Text representation
  // strips \r when it splits on /\r\n?|\n/, so markdownText.length would otherwise
  // over-count by one per carriage-return — causing selectionAnchor to exceed the
  // real post-insertion doc length and triggering a "Selection points outside of
  // document" RangeError on Windows where clipboardData returns \r\n plain text.
  const normalizedText = markdownText.replace(/\r\n?/g, '\n')
  const selection = view.state.selection.main
  const insertion = prepareMarkdownInsertion(normalizedText, view.state.sliceDoc(selection.to))

  insertMarkdown(view, insertion.text, {
    from: selection.from,
    to: selection.to,
  }, {
    selectionAnchor: selection.from + insertion.selectionOffset,
  })
}

function replaceSelectionWithImageMarkdown(view: EditorView, markdownText: string): void {
  insertImageMarkdown(view, markdownText, {
    from: view.state.selection.main.from,
    to: view.state.selection.main.to,
  })
}

function insertImageMarkdown(view: EditorView, markdownText: string, range: { from: number; to: number }): void {
  const insertion = prepareImageMarkdownInsertion(markdownText, view.state.sliceDoc(range.to))
  insertMarkdown(view, insertion.text, range, {
    selectionAnchor: range.from + insertion.selectionOffset,
  })
}

function insertMarkdown(
  view: EditorView,
  markdownText: string,
  range: { from: number; to: number },
  options: {
    isolateHistoryBoundary?: boolean
    userEvent?: string
    effects?: StateEffect<unknown>[]
    selectionAnchor?: number
    scrollIntoView?: boolean
  } = {}
): void {
  const requestedSelectionAnchor =
    options.selectionAnchor ?? Math.min(range.from, range.to) + markdownText.length
  const safeInsertion = resolveSafeEditorInsertion(
    view.state.doc.length,
    range,
    markdownText.length,
    requestedSelectionAnchor
  )
  const selectionAnchor = safeInsertion.selectionAnchor
  const effects =
    options.scrollIntoView === false
      ? options.effects
      : appendEditorSelectionScrollEffect(view, options.effects, selectionAnchor)

  view.dispatch({
    changes: { from: safeInsertion.range.from, to: safeInsertion.range.to, insert: markdownText },
    selection: { anchor: selectionAnchor },
    annotations: options.isolateHistoryBoundary ? isolateHistory.of('full') : undefined,
    effects,
    userEvent: options.userEvent,
  })

  if (options.scrollIntoView !== false) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // Re-dispatch scroll after CodeMirror has rendered the new content.
        // lineBlockAt() may return estimated coords for off-screen content on
        // the first dispatch, so a second pass with fresh measurements is needed
        // (important for large multi-image insertions).
        view.dispatch({
          effects: appendEditorSelectionScrollEffect(view, undefined, selectionAnchor),
        })
        keepEditorCursorBottomGap(view, { force: true })
      })
    )
  }
}

function createAIApplySnapshot(view: EditorView, tabId: string) {
  const docText = view.state.doc.toString()
  const selection = view.state.selection.main
  const blockRange = resolveCurrentBlockRange(docText, selection.head) ?? {
    from: selection.head,
    to: selection.head,
  }

  return {
    tabId,
    selectionFrom: selection.from,
    selectionTo: selection.to,
    anchorOffset: selection.head,
    blockFrom: blockRange.from,
    blockTo: blockRange.to,
    docText,
  }
}

async function buildImageMarkdown(
  files: File[],
  activeTabPath: string | null,
  activeTabId: string | null
): Promise<string> {
  if (isTauri) {
    const persistence = await getTauriFilePersistence()

    if (activeTabPath) {
      return persistImageFilesAsMarkdown(files, activeTabPath, persistence)
    }

    if (activeTabId) {
      return persistDraftImageFilesAsMarkdown(files, activeTabId, persistence)
    }
  }

  const snippets = await Promise.all(files.map((file) => fileToBase64Markdown(file)))
  return snippets.join('\n')
}

async function fileToBase64Markdown(file: File): Promise<string> {
  const altText = getImageAltText(file.name)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(`![${altText}](${event.target?.result as string})`)
    reader.readAsDataURL(file)
  })
}

function resolveInsertedProvenanceRange(
  from: number,
  insertedText: string
): { from: number; to: number } | null {
  const leadingTrimmedLength = insertedText.match(/^[\s\r\n]*/u)?.[0]?.length ?? 0
  const trailingTrimmedLength = insertedText.match(/[\s\r\n]*$/u)?.[0]?.length ?? 0
  const contentLength = insertedText.length - leadingTrimmedLength - trailingTrimmedLength

  if (contentLength <= 0) return null

  return {
    from: from + leadingTrimmedLength,
    to: from + leadingTrimmedLength + contentLength,
  }
}
