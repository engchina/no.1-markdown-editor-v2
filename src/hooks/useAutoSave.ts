import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store/editor'
import { useFileOps } from './useFileOps'

const AUTOSAVE_DELAY = 2000

export function useAutoSave() {
  const tabs = useEditorStore((state) => state.tabs)
  const { saveTabById } = useFileOps()
  const [saving, setSaving] = useState(false)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingContentRef = useRef<Map<string, string>>(new Map())
  const activeSavesRef = useRef(0)

  useEffect(() => {
    const pendingTabIds = new Set<string>()

    for (const tab of tabs) {
      if (!tab.isDirty || !tab.path) continue

      pendingTabIds.add(tab.id)
      const lastScheduledContent = pendingContentRef.current.get(tab.id)
      if (lastScheduledContent === tab.content) continue

      const existingTimer = timersRef.current.get(tab.id)
      if (existingTimer) clearTimeout(existingTimer)

      pendingContentRef.current.set(tab.id, tab.content)
      const timer = setTimeout(async () => {
        timersRef.current.delete(tab.id)
        activeSavesRef.current += 1
        setSaving(true)

        try {
          await saveTabById(tab.id)
        } finally {
          pendingContentRef.current.delete(tab.id)
          activeSavesRef.current = Math.max(0, activeSavesRef.current - 1)
          if (activeSavesRef.current === 0) {
            setTimeout(() => {
              if (activeSavesRef.current === 0) setSaving(false)
            }, 300)
          }
        }
      }, AUTOSAVE_DELAY)

      timersRef.current.set(tab.id, timer)
    }

    for (const [tabId, timer] of timersRef.current.entries()) {
      if (pendingTabIds.has(tabId)) continue
      clearTimeout(timer)
      timersRef.current.delete(tabId)
      pendingContentRef.current.delete(tabId)
    }
  }, [saveTabById, tabs])

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
      pendingContentRef.current.clear()
    }
  }, [])

  return { saving }
}
