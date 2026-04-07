import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n, { type Language } from '../i18n'

export type Theme = 'light' | 'dark'
export type ViewMode = 'source' | 'split' | 'preview' | 'focus'
export type SidebarTab = 'files' | 'outline' | 'search'

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
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabContent: (id: string, content: string) => void
  saveTab: (id: string) => void
  setTabPath: (id: string, path: string, name: string) => void

  // Cursor
  cursorPos: CursorPos
  setCursorPos: (pos: CursorPos) => void

  // Word count
  wordCount: number
  charCount: number
  setWordCount: (w: number, c: number) => void

  // Modes
  focusMode: boolean
  setFocusMode: (v: boolean) => void
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
}

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function createNewTab(overrides: Partial<FileTab> = {}): FileTab {
  const id = generateId()
  return {
    id,
    path: null,
    name: 'Untitled',
    content: '',
    savedContent: '',
    isDirty: false,
    ...overrides,
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
      sidebarWidth: 220,
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      sidebarOpen: true,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      sidebarTab: 'outline',
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      editorRatio: 0.5,
      setEditorRatio: (editorRatio) => set({ editorRatio }),

      // Tabs
      tabs: [createNewTab()],
      activeTabId: null,
      addTab: (overrides) => {
        const tab = createNewTab(overrides)
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
        return tab.id
      },
      closeTab: (id) => {
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id)
          if (tabs.length === 0) {
            const newTab = createNewTab()
            return { tabs: [newTab], activeTabId: newTab.id }
          }
          const activeId = s.activeTabId === id
            ? tabs[Math.max(0, s.tabs.findIndex((t) => t.id === id) - 1)].id
            : s.activeTabId
          return { tabs, activeTabId: activeId }
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

      // Cursor
      cursorPos: { line: 1, col: 1 },
      setCursorPos: (cursorPos) => set({ cursorPos }),

      // Word count
      wordCount: 0,
      charCount: 0,
      setWordCount: (wordCount, charCount) => set({ wordCount, charCount }),

      // Modes
      focusMode: false,
      setFocusMode: (focusMode) => set({ focusMode }),
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
      activeThemeId: 'default',
      setActiveThemeId: (activeThemeId) => set({ activeThemeId }),
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
        lineNumbers: s.lineNumbers,
        wordWrap: s.wordWrap,
        fontSize: s.fontSize,
        focusMode: s.focusMode,
        typewriterMode: s.typewriterMode,
        wysiwygMode: s.wysiwygMode,
        activeThemeId: s.activeThemeId,
      }),
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
