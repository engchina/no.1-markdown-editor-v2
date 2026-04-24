import { create } from 'zustand'

export type ExportActivityKind = 'html' | 'pdf' | 'markdown'

export interface ExportActivity {
  kind: ExportActivityKind
  phase: 'running' | 'success'
  updatedAt: number
}

interface ExportStatusState {
  activity: ExportActivity | null
  startExport: (kind: ExportActivityKind) => void
  finishExportSuccess: (kind: ExportActivityKind) => void
  clearExportStatus: () => void
}

export const useExportStatusStore = create<ExportStatusState>((set) => ({
  activity: null,
  startExport: (kind) =>
    set({
      activity: {
        kind,
        phase: 'running',
        updatedAt: Date.now(),
      },
    }),
  finishExportSuccess: (kind) =>
    set({
      activity: {
        kind,
        phase: 'success',
        updatedAt: Date.now(),
      },
    }),
  clearExportStatus: () => set({ activity: null }),
}))
