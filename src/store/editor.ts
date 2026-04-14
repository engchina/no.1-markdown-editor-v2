import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n, { type Language } from '../i18n/index.ts'
import type { AIHistoryProviderRerankBudget, AISelectedTextRole } from '../lib/ai/types.ts'
import {
  clampFocusWidthPx,
  FOCUS_WIDTH_PRESET_VALUES,
  type FocusWidthMode,
} from '../lib/focusWidth'
import { clearEditorStateSnapshot } from '../lib/editorStateCache.ts'
import {
  countRestorableDraftTabs,
  isRestorableDraftTab,
  restoreDraftTabs,
} from '../lib/draftRecovery'
import { clampSidebarWidth, SIDEBAR_DEFAULT_WIDTH } from '../lib/layout'
import { pathMatchesPrefix, remapPathPrefix } from '../lib/fileTreePaths'
import { pushInfoNotice } from '../lib/notices'
import type { AIDefaultWriteTarget } from '../lib/ai/opening.ts'

export type Theme = 'light' | 'dark'
export type ViewMode = 'source' | 'split' | 'preview' | 'focus'
export type SidebarTab = 'outline' | 'files' | 'recent' | 'search'
export type SyntaxHighlightEngine = 'highlightjs' | 'shiki'

export interface FileTab {
  id: string
  path: string | null
  name: string
  content: string
  savedContent: string
  isDirty: boolean
}

export interface CursorPos {
  line: number
  col: number
}

export interface PendingNavigation {
  tabId: string
  line: number
  column?: number
  align?: 'nearest' | 'start' | 'end' | 'center'
}

export interface ExternalFileConflict {
  tabId: string
  path: string
  name: string
  diskContent: string
  detectedAt: number
}

export interface ExternalMissingFile {
  tabId: string
  path: string
  name: string
  detectedAt: number
}

interface EditorState {
  // Theme
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void

  // Language
  language: Language
  setLanguage: (lang: Language) => void

  // View mode
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  // Layout
  sidebarWidth: number
  setSidebarWidth: (w: number) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  sidebarTab: SidebarTab
  setSidebarTab: (tab: SidebarTab) => void
  editorRatio: number
  setEditorRatio: (ratio: number) => void

  // Tabs / Files
  tabs: FileTab[]
  activeTabId: string | null
  addTab: (tab?: Partial<FileTab>) => string
  openDocument: (doc: Pick<FileTab, 'path' | 'name' | 'content' | 'savedContent'> & { isDirty?: boolean }) => string
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabContent: (id: string, content: string) => void
  saveTab: (id: string) => void
  setTabPath: (id: string, path: string, name: string) => void
  replaceTabFromDisk: (id: string, content: string) => void
  resolveExternalFileConflict: (id: string, content: string, diskContent: string) => void
  relinkTabToPath: (id: string, path: string, name: string, savedContent: string) => void
  remapTabsForPathChange: (oldPath: string, newPath: string) => void
  closeTabsByPathPrefix: (pathPrefix: string) => void
  convertTabToDraft: (id: string) => void
  externalFileConflicts: ExternalFileConflict[]
  upsertExternalFileConflict: (
    conflict: Omit<ExternalFileConflict, 'detectedAt'> & { detectedAt?: number }
  ) => void
  dismissExternalFileConflict: (tabId: string) => void
  dismissExternalFileConflictByPath: (path: string) => void
  externalMissingFiles: ExternalMissingFile[]
  upsertExternalMissingFile: (
    missing: Omit<ExternalMissingFile, 'detectedAt'> & { detectedAt?: number }
  ) => void
  dismissExternalMissingFile: (tabId: string) => void
  dismissExternalMissingFileByPath: (path: string) => void

  // Cursor
  cursorPos: CursorPos
  setCursorPos: (pos: CursorPos) => void
  pendingNavigation: PendingNavigation | null
  setPendingNavigation: (navigation: PendingNavigation | null) => void

  // Word count
  wordCount: number
  charCount: number
  setWordCount: (w: number, c: number) => void

  // Modes
  focusMode: boolean
  setFocusMode: (v: boolean) => void
  focusWidthMode: FocusWidthMode
  setFocusWidthMode: (mode: FocusWidthMode) => void
  focusWidthCustomPx: number
  setFocusWidthCustomPx: (px: number) => void
  typewriterMode: boolean
  setTypewriterMode: (v: boolean) => void
  lineNumbers: boolean
  setLineNumbers: (v: boolean) => void
  wordWrap: boolean
  setWordWrap: (v: boolean) => void
  fontSize: number
  setFontSize: (size: number) => void
  wysiwygMode: boolean
  setWysiwygMode: (v: boolean) => void
  activeThemeId: string
  setActiveThemeId: (id: string) => void
  zoom: number
  setZoom: (zoom: number) => void
  aiDefaultWriteTarget: AIDefaultWriteTarget
  aiDefaultSelectedTextRole: AISelectedTextRole
  aiHistoryProviderRerankEnabled: boolean
  aiHistoryProviderRerankBudget: AIHistoryProviderRerankBudget

  // Editor and Preview advanced features
  syntaxHighlightEngine: SyntaxHighlightEngine
  setSyntaxHighlightEngine: (engine: SyntaxHighlightEngine) => void
}

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function createNewTab(overrides: Partial<FileTab> = {}): FileTab {
  const id = generateId()
  return {
    id,
    path: null,
    name: i18n.t('app.untitled'),
    content: '',
    savedContent: '',
    isDirty: false,
    ...overrides,
  }
}

function isReusableScratchTab(tab: FileTab): boolean {
  return tab.path === null && !tab.isDirty && tab.content === '' && tab.savedContent === ''
}

const initialTab = createNewTab()

function sanitizeSidebarTab(value: unknown): SidebarTab {
  switch (value) {
    case 'files':
    case 'recent':
    case 'search':
    case 'outline':
      return value
    case 'ai':
    default:
      return 'outline'
  }
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      // Theme
      theme: 'light',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      // Language
      language: 'en',
      setLanguage: (lang) => {
        i18n.changeLanguage(lang)
        localStorage.setItem('language', lang)
        set({ language: lang })
      },

      // View mode
      viewMode: 'split',
      setViewMode: (viewMode) => set({ viewMode }),

      // Layout
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: clampSidebarWidth(sidebarWidth) }),
      sidebarOpen: true,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      sidebarTab: 'outline',
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      editorRatio: 0.5,
      setEditorRatio: (editorRatio) => set({ editorRatio }),

      // Advanced Options
      syntaxHighlightEngine: 'highlightjs',
      setSyntaxHighlightEngine: (syntaxHighlightEngine) => set({ syntaxHighlightEngine }),

      // Tabs
      tabs: [initialTab],
      activeTabId: initialTab.id,
      addTab: (overrides) => {
        const tab = createNewTab(overrides)
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
        return tab.id
      },
      openDocument: ({ path, name, content, savedContent, isDirty = false }) => {
        const doc = { path, name, content, savedContent, isDirty }
        let nextActiveId = ''

        set((s) => {
          if (path) {
            const existing = s.tabs.find((tab) => tab.path === path)
            if (existing) {
              nextActiveId = existing.id
              return {
                tabs: s.tabs.map((tab) =>
                  tab.id === existing.id
                    ? existing.isDirty
                      ? tab
                      : { ...tab, ...doc }
                    : tab
                ),
                activeTabId: existing.id,
              }
            }
          }

          const activeTab = s.tabs.find((tab) => tab.id === s.activeTabId) ?? s.tabs[0]
          if (activeTab && isReusableScratchTab(activeTab)) {
            nextActiveId = activeTab.id
            return {
              tabs: s.tabs.map((tab) =>
                tab.id === activeTab.id
                  ? { ...tab, ...doc }
                  : tab
              ),
              activeTabId: activeTab.id,
            }
          }

          const scratchTab = s.tabs.length === 1 && isReusableScratchTab(s.tabs[0]) ? s.tabs[0] : null
          if (scratchTab) {
            nextActiveId = scratchTab.id
            return {
              tabs: [{ ...scratchTab, ...doc }],
              activeTabId: scratchTab.id,
            }
          }

          const tab = createNewTab(doc)
          nextActiveId = tab.id
          return { tabs: [...s.tabs, tab], activeTabId: tab.id }
        })

        return nextActiveId
      },
      closeTab: (id) => {
        clearEditorStateSnapshot(id)
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id)
          if (tabs.length === 0) {
            const newTab = createNewTab()
            return {
              tabs: [newTab],
              activeTabId: newTab.id,
              externalFileConflicts: s.externalFileConflicts.filter((conflict) => conflict.tabId !== id),
              externalMissingFiles: s.externalMissingFiles.filter((missing) => missing.tabId !== id),
            }
          }
          const activeId = s.activeTabId === id
            ? tabs[Math.max(0, s.tabs.findIndex((t) => t.id === id) - 1)].id
            : s.activeTabId
          return {
            tabs,
            activeTabId: activeId,
            externalFileConflicts: s.externalFileConflicts.filter((conflict) => conflict.tabId !== id),
            externalMissingFiles: s.externalMissingFiles.filter((missing) => missing.tabId !== id),
          }
        })
      },
      setActiveTab: (activeTabId) => set({ activeTabId }),
      updateTabContent: (id, content) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, content, isDirty: content !== t.savedContent } : t
          ),
        }))
      },
      saveTab: (id) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, savedContent: t.content, isDirty: false } : t
          ),
        }))
      },
      setTabPath: (id, path, name) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, path, name } : t)),
        }))
      },
      replaceTabFromDisk: (id, content) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, content, savedContent: content, isDirty: false } : t
          ),
          externalFileConflicts: s.externalFileConflicts.filter((conflict) => conflict.tabId !== id),
          externalMissingFiles: s.externalMissingFiles.filter((missing) => missing.tabId !== id),
        }))
      },
      resolveExternalFileConflict: (id, content, diskContent) => {
        set((s) => ({
          tabs: s.tabs.map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  content,
                  savedContent: diskContent,
                  isDirty: content !== diskContent,
                }
              : tab
          ),
          externalFileConflicts: s.externalFileConflicts.filter((conflict) => conflict.tabId !== id),
        }))
      },
      relinkTabToPath: (id, path, name, savedContent) => {
        set((s) => ({
          tabs: s.tabs.map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  path,
                  name,
                  savedContent,
                  isDirty: tab.content !== savedContent,
                }
              : tab
          ),
          externalMissingFiles: s.externalMissingFiles.filter((missing) => missing.tabId !== id),
        }))
      },
      remapTabsForPathChange: (oldPath, newPath) => {
        set((s) => ({
          tabs: s.tabs.map((tab) => {
            if (!tab.path) return tab
            const remappedPath = remapPathPrefix(tab.path, oldPath, newPath)
            if (!remappedPath) return tab

            return {
              ...tab,
              path: remappedPath,
              name: remappedPath.split(/[\\/]/).pop() ?? tab.name,
            }
          }),
          externalFileConflicts: s.externalFileConflicts.map((conflict) => {
            const remappedPath = remapPathPrefix(conflict.path, oldPath, newPath)
            if (!remappedPath) return conflict

            return {
              ...conflict,
              path: remappedPath,
              name: remappedPath.split(/[\\/]/).pop() ?? conflict.name,
            }
          }),
          externalMissingFiles: s.externalMissingFiles.map((missing) => {
            const remappedPath = remapPathPrefix(missing.path, oldPath, newPath)
            if (!remappedPath) return missing

            return {
              ...missing,
              path: remappedPath,
              name: remappedPath.split(/[\\/]/).pop() ?? missing.name,
            }
          }),
        }))
      },
      closeTabsByPathPrefix: (pathPrefix) => {
        set((s) => {
          s.tabs
            .filter((tab) => tab.path && pathMatchesPrefix(tab.path, pathPrefix))
            .forEach((tab) => clearEditorStateSnapshot(tab.id))

          const tabs = s.tabs.filter((tab) => !tab.path || !pathMatchesPrefix(tab.path, pathPrefix))
          if (tabs.length === 0) {
            const newTab = createNewTab()
            return { tabs: [newTab], activeTabId: newTab.id }
          }

          const activeExists = tabs.some((tab) => tab.id === s.activeTabId)
          return {
            tabs,
            activeTabId: activeExists ? s.activeTabId : tabs[Math.max(0, tabs.length - 1)].id,
            externalFileConflicts: s.externalFileConflicts.filter(
              (conflict) => !pathMatchesPrefix(conflict.path, pathPrefix)
            ),
            externalMissingFiles: s.externalMissingFiles.filter(
              (missing) => !pathMatchesPrefix(missing.path, pathPrefix)
            ),
          }
        })
      },
      convertTabToDraft: (id) => {
        set((s) => ({
          tabs: s.tabs.map((tab) =>
            tab.id === id
              ? { ...tab, path: null, savedContent: '', isDirty: true }
              : tab
          ),
          externalFileConflicts: s.externalFileConflicts.filter((conflict) => conflict.tabId !== id),
          externalMissingFiles: s.externalMissingFiles.filter((missing) => missing.tabId !== id),
        }))
      },
      externalFileConflicts: [],
      upsertExternalFileConflict: (conflict) => {
        set((s) => {
          const existingIndex = s.externalFileConflicts.findIndex((entry) => entry.tabId === conflict.tabId)
          if (existingIndex === -1) {
            return {
              externalFileConflicts: [
                ...s.externalFileConflicts,
                { ...conflict, detectedAt: conflict.detectedAt ?? Date.now() },
              ],
            }
          }

          return {
            externalFileConflicts: s.externalFileConflicts.map((entry, index) =>
              index === existingIndex
                ? {
                    ...entry,
                    ...conflict,
                    detectedAt: conflict.detectedAt ?? entry.detectedAt,
                  }
                : entry
            ),
          }
        })
      },
      dismissExternalFileConflict: (tabId) => {
        set((s) => ({
          externalFileConflicts: s.externalFileConflicts.filter((conflict) => conflict.tabId !== tabId),
        }))
      },
      dismissExternalFileConflictByPath: (path) => {
        set((s) => ({
          externalFileConflicts: s.externalFileConflicts.filter((conflict) => conflict.path !== path),
        }))
      },
      externalMissingFiles: [],
      upsertExternalMissingFile: (missing) => {
        set((s) => {
          const existingIndex = s.externalMissingFiles.findIndex((entry) => entry.tabId === missing.tabId)
          if (existingIndex === -1) {
            return {
              externalMissingFiles: [
                ...s.externalMissingFiles,
                { ...missing, detectedAt: missing.detectedAt ?? Date.now() },
              ],
            }
          }

          return {
            externalMissingFiles: s.externalMissingFiles.map((entry, index) =>
              index === existingIndex
                ? {
                    ...entry,
                    ...missing,
                    detectedAt: missing.detectedAt ?? entry.detectedAt,
                  }
                : entry
            ),
          }
        })
      },
      dismissExternalMissingFile: (tabId) => {
        set((s) => ({
          externalMissingFiles: s.externalMissingFiles.filter((missing) => missing.tabId !== tabId),
        }))
      },
      dismissExternalMissingFileByPath: (path) => {
        set((s) => ({
          externalMissingFiles: s.externalMissingFiles.filter((missing) => missing.path !== path),
        }))
      },

      // Cursor
      cursorPos: { line: 1, col: 1 },
      setCursorPos: (cursorPos) => set({ cursorPos }),
      pendingNavigation: null,
      setPendingNavigation: (pendingNavigation) => set({ pendingNavigation }),

      // Word count
      wordCount: 0,
      charCount: 0,
      setWordCount: (wordCount, charCount) => set({ wordCount, charCount }),

      // Modes
      focusMode: false,
      setFocusMode: (focusMode) => set({ focusMode }),
      focusWidthMode: 'comfortable',
      setFocusWidthMode: (focusWidthMode) => set({ focusWidthMode }),
      focusWidthCustomPx: FOCUS_WIDTH_PRESET_VALUES.comfortable,
      setFocusWidthCustomPx: (focusWidthCustomPx) => set({ focusWidthCustomPx: clampFocusWidthPx(focusWidthCustomPx) }),
      typewriterMode: false,
      setTypewriterMode: (typewriterMode) => set({ typewriterMode }),
      lineNumbers: true,
      setLineNumbers: (lineNumbers) => set({ lineNumbers }),
      wordWrap: true,
      setWordWrap: (wordWrap) => set({ wordWrap }),
      fontSize: 14,
      setFontSize: (fontSize) => set({ fontSize }),
      wysiwygMode: false,
      setWysiwygMode: (wysiwygMode) => set({ wysiwygMode }),
      activeThemeId: 'default-light',
      setActiveThemeId: (activeThemeId) => set({ activeThemeId }),
      zoom: 100,
      setZoom: (zoom) => set({ zoom }),
      aiDefaultWriteTarget: 'insert-below',
      aiDefaultSelectedTextRole: 'transform-target',
      aiHistoryProviderRerankEnabled: true,
      aiHistoryProviderRerankBudget: 'balanced',
    }),
    {
      name: 'editor-settings',
      partialize: (s) => ({
        theme: s.theme,
        language: s.language,
        viewMode: s.viewMode,
        sidebarWidth: s.sidebarWidth,
        sidebarOpen: s.sidebarOpen,
        sidebarTab: s.sidebarTab,
        editorRatio: s.editorRatio,
        focusWidthMode: s.focusWidthMode,
        focusWidthCustomPx: s.focusWidthCustomPx,
        lineNumbers: s.lineNumbers,
        wordWrap: s.wordWrap,
        fontSize: s.fontSize,
        typewriterMode: s.typewriterMode,
        wysiwygMode: s.wysiwygMode,
        activeThemeId: s.activeThemeId,
        syntaxHighlightEngine: s.syntaxHighlightEngine,
        zoom: s.zoom,
        tabs: s.tabs.filter(isRestorableDraftTab),
        activeTabId: s.tabs.some((tab) => tab.id === s.activeTabId && isRestorableDraftTab(tab))
          ? s.activeTabId
          : null,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<EditorState> | undefined
        const restoredState = restoreDraftTabs(persistedState, {
          tabs: current.tabs,
          activeTabId: current.activeTabId,
        })
        const mergedState = {
          ...current,
          ...persistedState,
          ...restoredState,
        }

        return {
          ...mergedState,
          sidebarTab: sanitizeSidebarTab(persistedState?.sidebarTab),
          sidebarWidth: clampSidebarWidth(
            typeof persistedState?.sidebarWidth === 'number'
              ? persistedState.sidebarWidth
              : current.sidebarWidth
          ),
          aiDefaultWriteTarget: 'insert-below',
          aiDefaultSelectedTextRole: 'transform-target',
          aiHistoryProviderRerankEnabled: true,
          aiHistoryProviderRerankBudget: 'balanced',
          syntaxHighlightEngine: persistedState?.syntaxHighlightEngine ?? 'highlightjs',
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const restoredDraftCount = countRestorableDraftTabs(state.tabs)
        if (restoredDraftCount === 0) return

        pushInfoNotice('notices.draftsRestoredTitle', 'notices.draftsRestoredMessage', {
          values: { count: restoredDraftCount },
          timeoutMs: 4200,
        })
      },
    }
  )
)

// Computed: active tab
export function useActiveTab() {
  return useEditorStore((s) => {
    if (!s.activeTabId && s.tabs.length > 0) return s.tabs[0]
    return s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0] ?? null
  })
}
