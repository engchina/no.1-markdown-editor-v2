import { useCallback } from 'react'
import { useEditorStore } from '../store/editor'
import { useRecentFilesStore } from '../store/recentFiles'
import i18n from '../i18n'
import { MARKDOWN_FILE_EXTENSIONS } from '../lib/fileTypes'
import { pushErrorNotice } from '../lib/notices'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function getUntitledName(): string {
  return i18n.t('app.untitled')
}

export function useFileOps() {
  const addTab = useEditorStore((state) => state.addTab)
  const openDocument = useEditorStore((state) => state.openDocument)
  const saveTab = useEditorStore((state) => state.saveTab)
  const setTabPath = useEditorStore((state) => state.setTabPath)
  const addRecent = useRecentFilesStore((state) => state.addRecent)

  const newFile = useCallback(() => {
    addTab({ name: getUntitledName(), content: '', savedContent: '' })
  }, [addTab])

  const openFile = useCallback(async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        const path = await open({
          multiple: false,
          filters: [{ name: 'Markdown', extensions: [...MARKDOWN_FILE_EXTENSIONS] }],
        })
        if (!path || typeof path !== 'string') return

        const content = await readTextFile(path)
        const name = path.split(/[\\/]/).pop() ?? getUntitledName()
        openDocument({ path, name, content, savedContent: content, isDirty: false })
        addRecent(path, name)
      } catch (error) {
        console.error('Open file error:', error)
        pushErrorNotice('notices.openFileErrorTitle', 'notices.openFileErrorMessage')
      }
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = MARKDOWN_FILE_EXTENSIONS.map((extension) => `.${extension}`).join(',')
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (readerEvent) => {
        const content = (readerEvent.target?.result as string) ?? ''
        openDocument({
          path: null,
          name: file.name || getUntitledName(),
          content,
          savedContent: content,
          isDirty: false,
        })
      }
      reader.onerror = () => {
        console.error('Open file error:', reader.error)
        pushErrorNotice('notices.openFileErrorTitle', 'notices.openFileErrorMessage')
      }
      reader.readAsText(file)
    }
    input.click()
  }, [addRecent, openDocument])

  const saveTabById = useCallback(
    async (tabId: string, forceDialog = false): Promise<boolean> => {
      const state = useEditorStore.getState()
      const tab = state.tabs.find((entry) => entry.id === tabId)
      if (!tab) return false

      if (isTauri) {
        try {
          let savePath = forceDialog ? null : tab.path
          if (!savePath) {
            const { save } = await import('@tauri-apps/plugin-dialog')
            const result = await save({
              filters: [{ name: 'Markdown', extensions: [...MARKDOWN_FILE_EXTENSIONS] }],
              defaultPath: tab.name,
            })
            if (!result) return false
            savePath = result
          }

          const { writeTextFile } = await import('@tauri-apps/plugin-fs')
          await writeTextFile(savePath, tab.content)

          const name = savePath.split(/[\\/]/).pop() ?? tab.name
          setTabPath(tab.id, savePath, name)
          saveTab(tab.id)
          addRecent(savePath, name)
          return true
        } catch (error) {
          console.error('Save file error:', error)
          pushErrorNotice('notices.saveFileErrorTitle', 'notices.saveFileErrorMessage')
          return false
        }
      }

      try {
        const blob = new Blob([tab.content], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = /\.[A-Za-z0-9]+$/.test(tab.name) ? tab.name : `${tab.name}.md`
        anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        saveTab(tab.id)
        return true
      } catch (error) {
        console.error('Save file error:', error)
        pushErrorNotice('notices.saveFileErrorTitle', 'notices.saveFileErrorMessage')
        return false
      }
    },
    [addRecent, saveTab, setTabPath]
  )

  const saveFile = useCallback(async () => {
    const state = useEditorStore.getState()
    const activeTab = state.tabs.find((entry) => entry.id === state.activeTabId) ?? state.tabs[0]
    if (!activeTab) return false
    return saveTabById(activeTab.id)
  }, [saveTabById])

  const saveTabAsById = useCallback(
    async (tabId: string): Promise<boolean> => saveTabById(tabId, true),
    [saveTabById]
  )

  const saveFileAs = useCallback(async () => {
    const state = useEditorStore.getState()
    const activeTab = state.tabs.find((entry) => entry.id === state.activeTabId) ?? state.tabs[0]
    if (!activeTab) return false
    return saveTabAsById(activeTab.id)
  }, [saveTabAsById])

  const saveAllDirtyTabs = useCallback(async (): Promise<boolean> => {
    const { tabs } = useEditorStore.getState()
    const dirtyTabs = tabs.filter((tab) => tab.isDirty)

    for (const tab of dirtyTabs) {
      const saved = await saveTabById(tab.id)
      if (!saved) return false
    }

    return true
  }, [saveTabById])

  return {
    newFile,
    openFile,
    saveFile,
    saveFileAs,
    saveTabById,
    saveTabAsById,
    saveAllDirtyTabs,
  }
}
