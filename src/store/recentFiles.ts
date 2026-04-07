import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface RecentFile {
  path: string
  name: string
  openedAt: number
}

interface RecentFilesState {
  recentFiles: RecentFile[]
  addRecent: (path: string, name: string) => void
  clearRecent: () => void
  removeRecent: (path: string) => void
}

const STORAGE_KEY = 'recent-files'
const MAX_RECENT = 20

export const useRecentFilesStore = create<RecentFilesState>()(
  persist(
    (set) => ({
      recentFiles: [],
      addRecent: (path, name) => {
        set((state) => {
          const filtered = state.recentFiles.filter((file) => file.path !== path)
          return {
            recentFiles: [{ path, name, openedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT),
          }
        })
      },
      clearRecent: () => set({ recentFiles: [] }),
      removeRecent: (path) => {
        set((state) => ({
          recentFiles: state.recentFiles.filter((file) => file.path !== path),
        }))
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ recentFiles: state.recentFiles }),
    }
  )
)
