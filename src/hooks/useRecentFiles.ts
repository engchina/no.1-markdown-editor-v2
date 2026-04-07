import { useCallback } from 'react'
import { useEditorStore } from '../store/editor'
import { useRecentFilesStore, type RecentFile } from '../store/recentFiles'
import { pushErrorNotice, pushInfoNotice } from '../lib/notices'

export type { RecentFile } from '../store/recentFiles'

export function useRecentFiles() {
  const recentFiles = useRecentFilesStore((state) => state.recentFiles)
  const addRecent = useRecentFilesStore((state) => state.addRecent)
  const clearRecent = useRecentFilesStore((state) => state.clearRecent)
  const removeRecent = useRecentFilesStore((state) => state.removeRecent)
  const openDocument = useEditorStore((state) => state.openDocument)
  const canReopenRecent = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  const openRecent = useCallback(
    async (file: RecentFile) => {
      if (!canReopenRecent) {
        pushInfoNotice('notices.recentFileBrowserTitle', 'notices.recentFileBrowserMessage')
        return
      }

      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        const content = await readTextFile(file.path)
        openDocument({
          path: file.path,
          name: file.name,
          content,
          savedContent: content,
          isDirty: false,
        })
        addRecent(file.path, file.name)
      } catch (error) {
        console.error('Open recent error:', error)
        pushErrorNotice('notices.recentFileErrorTitle', 'notices.recentFileErrorMessage')
        removeRecent(file.path)
      }
    },
    [addRecent, canReopenRecent, openDocument, removeRecent]
  )

  return { recentFiles, addRecent, openRecent, clearRecent, canReopenRecent }
}
