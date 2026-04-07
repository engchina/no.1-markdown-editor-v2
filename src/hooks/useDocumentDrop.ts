import { useEffect } from 'react'
import { useRecentFilesStore } from '../store/recentFiles'
import { useEditorStore } from '../store/editor'
import { isSupportedDocumentName } from '../lib/fileTypes'
import { pushErrorNotice } from '../lib/notices'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function useDocumentDrop() {
  const openDocument = useEditorStore((state) => state.openDocument)
  const addRecent = useRecentFilesStore((state) => state.addRecent)

  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = async (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => isSupportedDocumentName(file.name))
      if (files.length === 0) return

      event.preventDefault()

      try {
        for (const file of files) {
          if (isTauri) {
            const path = (file as { path?: string }).path ?? null
            const text = path
              ? await (await import('@tauri-apps/plugin-fs')).readTextFile(path)
              : await file.text()

            openDocument({
              path,
              name: file.name,
              content: text,
              savedContent: text,
              isDirty: false,
            })
            if (path) addRecent(path, file.name)
            continue
          }

          const text = await file.text()
          openDocument({
            path: null,
            name: file.name,
            content: text,
            savedContent: text,
            isDirty: false,
          })
        }
      } catch (error) {
        console.error('Document drop error:', error)
        pushErrorNotice('notices.openFileErrorTitle', 'notices.openFileErrorMessage')
      }
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [addRecent, openDocument])
}
