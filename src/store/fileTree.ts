import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileNode[]
  expanded?: boolean
}

interface FileTreeState {
  rootPath: string | null
  tree: FileNode[]
  loading: boolean
  setRootPath: (path: string | null) => void
  setTree: (tree: FileNode[]) => void
  setLoading: (loading: boolean) => void
}

export const useFileTreeStore = create<FileTreeState>()(
  persist(
    (set) => ({
      rootPath: null,
      tree: [],
      loading: false,
      setRootPath: (rootPath) => set({ rootPath }),
      setTree: (tree) => set({ tree }),
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: 'file-tree',
      partialize: (state) => ({ rootPath: state.rootPath }),
    }
  )
)
