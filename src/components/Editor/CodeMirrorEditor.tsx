import { useEffect, useRef, useCallback } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { buildExtensions } from './extensions'
import { useEditorStore } from '../../store/editor'

interface Props {
  content: string
  onChange: (content: string) => void
}

export default function CodeMirrorEditor({ content, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isUpdatingRef = useRef(false)

  const { lineNumbers, wordWrap, fontSize, typewriterMode, wysiwygMode, setCursorPos } = useEditorStore()

  const handleCursorChange = useCallback(
    (line: number, col: number) => {
      setCursorPos({ line, col })
    },
    [setCursorPos]
  )

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return

    const extensions = buildExtensions({
      lineNumbers,
      wordWrap,
      wysiwyg: wysiwygMode,
      onChange: (newContent) => {
        if (!isUpdatingRef.current) {
          onChange(newContent)
        }
      },
      onCursorChange: handleCursorChange,
    })

    const state = EditorState.create({
      doc: content,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineNumbers, wordWrap, wysiwygMode])

  // Sync content changes from outside (file open, new tab, etc.)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentContent = view.state.doc.toString()
    if (currentContent === content) return

    isUpdatingRef.current = true
    view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: content },
    })
    isUpdatingRef.current = false
  }, [content])

  return (
    <div
      ref={containerRef}
      className="h-full overflow-hidden"
      style={{ fontSize: `${fontSize}px` }}
      data-typewriter={typewriterMode}
    />
  )
}
