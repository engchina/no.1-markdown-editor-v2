import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  buildCoreExtensions,
  buildLineNumberExtensions,
  buildPlaceholderExtensions,
  buildWordWrapExtensions,
} from './extensions'
import {
  loadAutocompleteExtensions,
  loadMarkdownLanguageExtensions,
  loadSearchSupport,
  type SearchSupport,
} from './optionalFeatures'
import { applyFormat } from './formatCommands'
import { getImageAltText, getImageFileExtension } from '../../lib/fileTypes'
import { useActiveTab, useEditorStore } from '../../store/editor'
import SearchBar from '../Search/SearchBar'

interface Props {
  content: string
  onChange: (content: string) => void
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export default function CodeMirrorEditor({ content, onChange }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isUpdatingRef = useRef(false)
  const onChangeRef = useRef(onChange)
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

  const lineNumbers = useEditorStore((state) => state.lineNumbers)
  const wordWrap = useEditorStore((state) => state.wordWrap)
  const fontSize = useEditorStore((state) => state.fontSize)
  const typewriterMode = useEditorStore((state) => state.typewriterMode)
  const wysiwygMode = useEditorStore((state) => state.wysiwygMode)
  const focusMode = useEditorStore((state) => state.focusMode)
  const pendingNavigation = useEditorStore((state) => state.pendingNavigation)
  const setPendingNavigation = useEditorStore((state) => state.setPendingNavigation)
  const setCursorPos = useEditorStore((state) => state.setCursorPos)
  const activeTab = useActiveTab()

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchReplace, setSearchReplace] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchSupport, setSearchSupport] = useState<SearchSupport | null>(null)
  const [markdownLanguageExtensions, setMarkdownLanguageExtensions] = useState<Extension[]>([])
  const [autocompleteExtensions, setAutocompleteExtensions] = useState<Extension[]>([])
  const [wysiwygExtensions, setWysiwygExtensions] = useState<Extension[]>([])

  const handleCursorChange = useCallback(
    (line: number, col: number) => {
      setCursorPos({ line, col })
    },
    [setCursorPos]
  )

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const reconfigure = useCallback((compartment: Compartment, extension: Extension) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: compartment.reconfigure(extension) })
  }, [])

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
    void import('./wysiwyg').then(({ wysiwygPlugin, wysiwygTheme }) => {
      if (!cancelled) setWysiwygExtensions([wysiwygPlugin, wysiwygTheme])
    })

    return () => {
      cancelled = true
    }
  }, [wysiwygMode])

  useEffect(() => {
    const container = containerRef.current
    if (!container || viewRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        ...buildCoreExtensions({
          onChange: (nextContent: string) => {
            if (!isUpdatingRef.current) onChangeRef.current(nextContent)
          },
          onCursorChange: handleCursorChange,
        }),
        lineNumbersCompartmentRef.current.of(lineNumbers ? buildLineNumberExtensions() : []),
        wordWrapCompartmentRef.current.of(buildWordWrapExtensions(wordWrap)),
        placeholderCompartmentRef.current.of(buildPlaceholderExtensions(t('placeholder'))),
        languageCompartmentRef.current.of([]),
        searchCompartmentRef.current.of([]),
        autocompleteCompartmentRef.current.of([]),
        wysiwygCompartmentRef.current.of([]),
      ],
    })

    const view = new EditorView({ state, parent: container })
    viewRef.current = view
    view.focus()
    handleCursorChange(1, 1)

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let idleId: number | undefined

    const scheduleLoad = () => {
      void ensureAutocompleteExtensions()
    }

    if (typeof (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback === 'function') {
      const api = window as Window & {
        requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
        cancelIdleCallback: (handle: number) => void
      }
      idleId = api.requestIdleCallback(() => scheduleLoad(), { timeout: 1500 })
    } else {
      timeoutId = setTimeout(scheduleLoad, 400)
    }

    return () => {
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        ;(window as Window & { cancelIdleCallback: (handle: number) => void }).cancelIdleCallback(idleId)
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId)
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
    reconfigure(wysiwygCompartmentRef.current, wysiwygExtensions)
  }, [reconfigure, wysiwygExtensions])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const current = view.state.doc.toString()
    if (current === content) return

    isUpdatingRef.current = true
    view.dispatch({ changes: { from: 0, to: current.length, insert: content } })
    isUpdatingRef.current = false
  }, [content])

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
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key === 'f') {
        event.preventDefault()
        openSearchPanel(false)
      }
      if (mod && event.key === 'h') {
        event.preventDefault()
        openSearchPanel(true)
      }
    }

    const onSearchRequested = (event: Event) => {
      const detail = (event as CustomEvent).detail as { replace: boolean }
      openSearchPanel(detail.replace)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('editor:search', onSearchRequested)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('editor:search', onSearchRequested)
    }
  }, [openSearchPanel])

  useEffect(() => {
    if (!pendingNavigation || pendingNavigation.tabId !== activeTab?.id) return

    const view = viewRef.current
    if (!view) return

    const lineNumber = Math.max(1, Math.min(pendingNavigation.line, view.state.doc.lines))
    const line = view.state.doc.line(lineNumber)
    const column = Math.max(1, pendingNavigation.column ?? 1)
    const anchor = Math.min(line.to, line.from + column - 1)

    view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
    })
    view.focus()
    setPendingNavigation(null)
  }, [activeTab?.id, pendingNavigation, setPendingNavigation])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePaste = async (event: ClipboardEvent) => {
      const view = viewRef.current
      if (!view) return

      const items = event.clipboardData?.items
      if (!items) return

      const imageFiles = Array.from(items)
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)

      if (imageFiles.length === 0) return

      event.preventDefault()
      const markdownText = await buildImageMarkdown(imageFiles, activeTab?.path ?? null)
      insertMarkdown(view, markdownText)
    }

    container.addEventListener('paste', handlePaste)
    return () => container.removeEventListener('paste', handlePaste)
  }, [activeTab?.path])

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
      const markdownText = await buildImageMarkdown(imageFiles, activeTab?.path ?? null)
      insertMarkdown(view, markdownText, dropPos)
    }

    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('drop', handleDrop)
    return () => {
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('drop', handleDrop)
    }
  }, [activeTab?.path])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {searchOpen && (
        <SearchBar
          editorView={viewRef.current}
          searchSupport={searchSupport}
          loading={searchLoading}
          showReplace={searchReplace}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden transition-all duration-300"
        style={{
          fontSize: `${fontSize}px`,
          maxWidth: focusMode ? '720px' : undefined,
          margin: focusMode ? '0 auto' : undefined,
        }}
      />
    </div>
  )
}

function insertMarkdown(view: EditorView, markdownText: string, anchor = view.state.selection.main.from): void {
  view.dispatch({
    changes: { from: anchor, to: anchor, insert: markdownText },
    selection: { anchor: anchor + markdownText.length },
  })
}

async function buildImageMarkdown(files: File[], activeTabPath: string | null): Promise<string> {
  const batchId = Date.now()

  if (isTauri && activeTabPath) {
    try {
      const { mkdir, writeFile } = await import('@tauri-apps/plugin-fs')
      const { dirname, join } = await import('@tauri-apps/api/path')
      const parentDir = await dirname(activeTabPath)
      const assetDir = await join(parentDir, '_assets')
      await mkdir(assetDir, { recursive: true })

      const snippets = await Promise.all(
        files.map(async (file, index) => {
          const extension = getImageFileExtension(file.name, file.type)
          const altText = getImageAltText(file.name)
          const suffix = files.length > 1 ? `-${index + 1}` : ''
          const fileName = `image-${batchId}${suffix}.${extension}`
          const assetPath = await join(assetDir, fileName)

          await writeFile(assetPath, new Uint8Array(await file.arrayBuffer()))
          return `![${altText}](_assets/${fileName})`
        })
      )

      return snippets.join('\n')
    } catch (error) {
      console.error('Persist dropped image error:', error)
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
