import { create } from 'zustand'

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

export const useFileTreeStore = create<FileTreeState>((set) => ({
  rootPath: null,
  tree: [],
  loading: false,
  setRootPath: (rootPath) => set({ rootPath }),
  setTree: (tree) => set({ tree }),
  setLoading: (loading) => set({ loading }),
}))
