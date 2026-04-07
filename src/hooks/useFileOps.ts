import { useCallback } from 'react'
import { useEditorStore } from '../store/editor'

// Detect Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function useFileOps() {
  const { addTab, tabs, activeTabId, saveTab, setTabPath } = useEditorStore()

  const newFile = useCallback(() => {
    addTab({ name: 'Untitled', content: '', savedContent: '' })
  }, [addTab])

  const openFile = useCallback(async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        const path = await open({
          multiple: false,
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
        })
        if (!path || typeof path !== 'string') return
        const content = await readTextFile(path)
        const name = path.split(/[\\/]/).pop() ?? 'Untitled'
        addTab({ path, name, content, savedContent: content, isDirty: false })
      } catch (e) {
        console.error('Open file error:', e)
      }
    } else {
      // Browser fallback
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.md,.markdown,.txt'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
          const content = ev.target?.result as string
          addTab({ name: file.name, content, savedContent: content, isDirty: false })
        }
        reader.readAsText(file)
      }
      input.click()
    }
  }, [addTab])

  const saveFile = useCallback(async () => {
    const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
    if (!activeTab) return

    if (isTauri) {
      try {
        let savePath = activeTab.path
        if (!savePath) {
          const { save } = await import('@tauri-apps/plugin-dialog')
          const result = await save({
            filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
            defaultPath: activeTab.name,
          })
          if (!result) return
          savePath = result
        }
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        await writeTextFile(savePath, activeTab.content)
        const name = savePath.split(/[\\/]/).pop() ?? activeTab.name
        setTabPath(activeTab.id, savePath, name)
        saveTab(activeTab.id)
      } catch (e) {
        console.error('Save file error:', e)
      }
    } else {
      // Browser fallback
      const blob = new Blob([activeTab.content], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = activeTab.name.endsWith('.md') ? activeTab.name : `${activeTab.name}.md`
      a.click()
      URL.revokeObjectURL(url)
      saveTab(activeTab.id)
    }
  }, [tabs, activeTabId, saveTab, setTabPath])

  const saveFileAs = useCallback(async () => {
    const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
    if (!activeTab) return

    if (isTauri) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const savePath = await save({
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
          defaultPath: activeTab.name,
        })
        if (!savePath) return
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        await writeTextFile(savePath, activeTab.content)
        const name = savePath.split(/[\\/]/).pop() ?? activeTab.name
        setTabPath(activeTab.id, savePath, name)
        saveTab(activeTab.id)
      } catch (e) {
        console.error('Save as error:', e)
      }
    } else {
      saveFile()
    }
  }, [tabs, activeTabId, saveTab, setTabPath, saveFile])

  return { newFile, openFile, saveFile, saveFileAs }
}
