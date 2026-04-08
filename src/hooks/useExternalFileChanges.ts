import { useEffect, useMemo, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../store/editor'
import { pushInfoNotice } from '../lib/notices'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function useExternalFileChanges() {
  const tabs = useEditorStore((state) => state.tabs)
  const watchedPaths = useMemo(
    () =>
      Array.from(
        new Set(
          tabs
            .map((tab) => tab.path)
            .filter((path): path is string => typeof path === 'string' && path.length > 0)
        )
      ),
    [tabs]
  )
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const warnedMissingRef = useRef(new Set<string>())
  const warnedConflictRef = useRef(new Map<string, string>())

  useEffect(() => {
    const activePaths = new Set(watchedPaths)
    for (const [path, timer] of timersRef.current.entries()) {
      if (activePaths.has(path)) continue
      clearTimeout(timer)
      timersRef.current.delete(path)
      warnedMissingRef.current.delete(path)
      warnedConflictRef.current.delete(path)
      useEditorStore.getState().dismissExternalFileConflictByPath(path)
      useEditorStore.getState().dismissExternalMissingFileByPath(path)
    }
  }, [watchedPaths])

  useEffect(() => {
    if (!isTauri || watchedPaths.length === 0) return

    let disposed = false
    let unwatch: (() => void) | undefined

    const scheduleVerification = (path: string) => {
      const existing = timersRef.current.get(path)
      if (existing) clearTimeout(existing)

      const timer = setTimeout(() => {
        timersRef.current.delete(path)
        void verifyExternalFileChange(path, warnedMissingRef.current, warnedConflictRef.current)
      }, 220)

      timersRef.current.set(path, timer)
    }

    const verifyAll = () => {
      for (const path of watchedPaths) {
        scheduleVerification(path)
      }
    }

    const onFocus = () => {
      verifyAll()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') verifyAll()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    void (async () => {
      try {
        const { watch } = await import('@tauri-apps/plugin-fs')
        if (disposed) return

        unwatch = await watch(
          watchedPaths,
          (event) => {
            for (const changedPath of event.paths) {
              scheduleVerification(changedPath)
            }
          },
          { delayMs: 180 }
        )
      } catch (error) {
        console.error('External file watch registration error:', error)
      }
    })()

    verifyAll()

    return () => {
      disposed = true
      if (unwatch) unwatch()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [watchedPaths])
}

async function verifyExternalFileChange(
  path: string,
  warnedMissing: Set<string>,
  warnedConflict: Map<string, string>
) {
  const currentTab = useEditorStore.getState().tabs.find((tab) => tab.path === path)
  if (!currentTab) return

  try {
    const { exists } = await import('@tauri-apps/plugin-fs')
    const onDisk = await exists(path)
    if (!onDisk) {
      useEditorStore.getState().dismissExternalFileConflictByPath(path)
      useEditorStore.getState().upsertExternalMissingFile({
        tabId: currentTab.id,
        path,
        name: currentTab.name,
      })
      warnedMissing.add(path)
      return
    }
  } catch (error) {
    console.error('External file exists check error:', error)
  }

  warnedMissing.delete(path)
  useEditorStore.getState().dismissExternalMissingFileByPath(path)

  let diskContent = ''
  try {
    diskContent = await invoke<string>('read_file', { path })
  } catch (error) {
    console.error('External file reload error:', error)
    useEditorStore.getState().upsertExternalMissingFile({
      tabId: currentTab.id,
      path,
      name: currentTab.name,
    })
    warnedMissing.add(path)
    return
  }

  const latestTab = useEditorStore.getState().tabs.find((tab) => tab.path === path)
  if (!latestTab) return
  if (diskContent === latestTab.content && diskContent === latestTab.savedContent) {
    warnedConflict.delete(path)
    useEditorStore.getState().dismissExternalFileConflictByPath(path)
    return
  }

  if (latestTab.isDirty) {
    if (warnedConflict.get(path) === diskContent) return
    warnedConflict.set(path, diskContent)
    useEditorStore.getState().upsertExternalFileConflict({
      tabId: latestTab.id,
      path,
      name: latestTab.name,
      diskContent,
    })
    return
  }

  warnedConflict.delete(path)
  useEditorStore.getState().replaceTabFromDisk(latestTab.id, diskContent)
  pushInfoNotice('notices.externalFileReloadedTitle', 'notices.externalFileReloadedMessage', {
    values: { name: latestTab.name },
    timeoutMs: 2800,
  })
}
