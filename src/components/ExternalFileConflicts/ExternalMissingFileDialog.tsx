import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { countDocumentStats } from '../../lib/editorStats'
import { MARKDOWN_FILE_EXTENSIONS } from '../../lib/fileTypes'
import { pushErrorNotice, pushInfoNotice } from '../../lib/notices'
import { useRecentFilesStore } from '../../store/recentFiles'
import { useEditorStore } from '../../store/editor'
import { useFileOps } from '../../hooks/useFileOps'
import AppIcon from '../Icons/AppIcon'

function summarizeDocument(content: string): { lines: number; words: number; chars: number } {
  return {
    lines: content.length === 0 ? 1 : content.split(/\r?\n/).length,
    ...countDocumentStats(content),
  }
}

export default function ExternalMissingFileDialog() {
  const { t } = useTranslation()
  const missingFiles = useEditorStore((state) => state.externalMissingFiles)
  const tabs = useEditorStore((state) => state.tabs)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const convertTabToDraft = useEditorStore((state) => state.convertTabToDraft)
  const closeTab = useEditorStore((state) => state.closeTab)
  const relinkTabToPath = useEditorStore((state) => state.relinkTabToPath)
  const upsertExternalFileConflict = useEditorStore((state) => state.upsertExternalFileConflict)
  const dismissExternalMissingFile = useEditorStore((state) => state.dismissExternalMissingFile)
  const addRecent = useRecentFilesStore((state) => state.addRecent)
  const { saveTabAsById } = useFileOps()
  const [busyAction, setBusyAction] = useState<'saveAs' | 'relink' | 'draft' | 'close' | null>(null)
  const saveButtonRef = useRef<HTMLButtonElement>(null)

  const missing = missingFiles[0] ?? null
  const tab = useMemo(
    () => (missing ? tabs.find((entry) => entry.id === missing.tabId) ?? null : null),
    [missing, tabs]
  )

  useEffect(() => {
    if (!missing) return
    if (tab) setActiveTab(tab.id)
    saveButtonRef.current?.focus()
  }, [missing?.tabId, setActiveTab, tab])

  useEffect(() => {
    setBusyAction(null)
  }, [missing?.tabId])

  useEffect(() => {
    if (!missing || tab) return
    dismissExternalMissingFile(missing.tabId)
  }, [dismissExternalMissingFile, missing, tab])

  if (!missing || !tab) return null

  const queuedMissingFiles = missingFiles.length - 1
  const stats = summarizeDocument(tab.content)

  const saveAsNewFile = async () => {
    setBusyAction('saveAs')
    setActiveTab(tab.id)
    const saved = await saveTabAsById(tab.id)
    if (saved) {
      dismissExternalMissingFile(tab.id)
    }
    setBusyAction(null)
  }

  const relinkExistingFile = async () => {
    setBusyAction('relink')
    setActiveTab(tab.id)

    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: [...MARKDOWN_FILE_EXTENSIONS] }],
      })
      if (!selectedPath || typeof selectedPath !== 'string') {
        setBusyAction(null)
        return
      }

      const existingTab = useEditorStore.getState().tabs.find(
        (entry) => entry.path === selectedPath && entry.id !== tab.id
      )
      if (existingTab) {
        pushErrorNotice('notices.externalFileRelinkErrorTitle', 'notices.externalFileRelinkAlreadyOpenMessage', {
          values: { name: existingTab.name },
        })
        setBusyAction(null)
        return
      }

      const diskContent = await invoke<string>('read_file', { path: selectedPath })
      const nextName = selectedPath.split(/[\\/]/).pop() ?? tab.name

      relinkTabToPath(tab.id, selectedPath, nextName, diskContent)
      addRecent(selectedPath, nextName)
      dismissExternalMissingFile(tab.id)

      if (tab.content !== diskContent) {
        upsertExternalFileConflict({
          tabId: tab.id,
          path: selectedPath,
          name: nextName,
          diskContent,
        })
      } else {
        pushInfoNotice('notices.externalFileRelinkedTitle', 'notices.externalFileRelinkedMessage', {
          values: { name: nextName },
          timeoutMs: 2800,
        })
      }
    } catch (error) {
      console.error('Relink missing file error:', error)
      pushErrorNotice('notices.externalFileRelinkErrorTitle', 'notices.externalFileRelinkErrorMessage')
    } finally {
      setBusyAction(null)
    }
  }

  const keepAsDraft = () => {
    setBusyAction('draft')
    setActiveTab(tab.id)
    convertTabToDraft(tab.id)
    dismissExternalMissingFile(tab.id)
    pushInfoNotice('notices.externalFileDetachedTitle', 'notices.externalFileDetachedMessage', {
      values: { name: tab.name },
      timeoutMs: 3200,
    })
    setBusyAction(null)
  }

  const closeMissingTab = () => {
    setBusyAction('close')
    closeTab(tab.id)
    dismissExternalMissingFile(tab.id)
    setBusyAction(null)
  }

  const anyActionRunning = busyAction !== null

  return (
    <div
      className="fixed inset-0 z-[145] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--bg-primary) 34%, rgba(0, 0, 0, 0.44))' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('externalMissing.title')}
        className="glass-panel animate-in flex w-full max-w-[min(720px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.5rem] shadow-2xl"
        style={{
          background: 'color-mix(in srgb, var(--bg-primary) 96%, transparent)',
          borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
          maxHeight: 'min(82vh, 760px)',
        }}
      >
        <div className="flex items-start gap-4 px-5 py-4" style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 78%, transparent)' }}>
          <div
            className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: 'color-mix(in srgb, #dc2626 16%, transparent)',
              color: '#dc2626',
            }}
          >
            <AppIcon name="alertCircle" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="truncate text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('externalMissing.title')}
              </h2>
              {queuedMissingFiles > 0 && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    color: 'var(--accent)',
                  }}
                >
                  {t('externalMissing.queue', { count: queuedMissingFiles })}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {t('externalMissing.description')}
            </p>
            <div
              className="mt-3 rounded-xl px-3 py-2 text-[12px]"
              style={{
                background: 'color-mix(in srgb, var(--bg-secondary) 84%, transparent)',
                border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
              }}
            >
              {missing.path}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <section
            className="overflow-hidden rounded-2xl"
            style={{
              border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
              background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
            }}
          >
            <div
              className="flex items-start justify-between gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 70%, transparent)' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {t('externalMissing.currentTitle')}
                </p>
                <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
                  {t('externalMissing.currentSubtitle')}
                </p>
              </div>
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
                style={{
                  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                {t('externalMissing.stats', stats)}
              </span>
            </div>
            <textarea
              readOnly
              spellCheck={false}
              value={tab.content}
              className="min-h-[220px] w-full resize-none bg-transparent px-4 py-3 text-[12px] leading-6 outline-none"
              style={{
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
              }}
            />
          </section>
        </div>

        <div
          className="flex flex-col gap-3 px-5 py-4"
          style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 78%, transparent)' }}
        >
          <p className="text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
            {t('externalMissing.recoveryHint')}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              ref={saveButtonRef}
              type="button"
              onClick={() => { void relinkExistingFile() }}
              disabled={anyActionRunning}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-45"
              style={{
                background: 'var(--accent)',
                color: 'white',
              }}
            >
              {t('externalMissing.relinkExisting')}
            </button>
            <button
              type="button"
              onClick={() => { void saveAsNewFile() }}
              disabled={anyActionRunning}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-45"
              style={{
                background: 'color-mix(in srgb, var(--bg-secondary) 92%, transparent)',
                color: 'var(--text-secondary)',
                border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
              }}
            >
              {t('externalMissing.saveAs')}
            </button>
            <button
              type="button"
              onClick={keepAsDraft}
              disabled={anyActionRunning}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-45"
              style={{
                background: 'color-mix(in srgb, var(--bg-tertiary) 92%, transparent)',
                color: 'var(--text-secondary)',
                border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
              }}
            >
              {t('externalMissing.keepDraft')}
            </button>
            <button
              type="button"
              onClick={closeMissingTab}
              disabled={anyActionRunning}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-45"
              style={{
                background: 'color-mix(in srgb, #dc2626 14%, transparent)',
                color: '#dc2626',
                border: '1px solid color-mix(in srgb, #dc2626 28%, transparent)',
              }}
            >
              {t('externalMissing.closeTab')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
