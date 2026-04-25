import type { AIProvenanceMark } from '../lib/ai/types.ts'

type SliceSet<T> = (partial: object | ((state: T) => object)) => void

export interface AIProvenanceSliceState {
  provenanceMarksByTab: Record<string, AIProvenanceMark[]>
  setProvenanceMarks: (tabId: string, marks: AIProvenanceMark[]) => void
  addProvenanceMark: (tabId: string, mark: AIProvenanceMark) => void
  getProvenanceMarks: (tabId: string) => AIProvenanceMark[]
  clearProvenanceMarks: (tabId: string) => void
}

type SliceGet<T> = () => T

export function createAIProvenanceSlice<
  T extends AIProvenanceSliceState
>(
  set: SliceSet<T>,
  get: SliceGet<T>
): AIProvenanceSliceState {
  return {
    provenanceMarksByTab: {},
    setProvenanceMarks: (tabId, marks) =>
      set((state) => ({
        provenanceMarksByTab: {
          ...state.provenanceMarksByTab,
          [tabId]: marks,
        },
      })),
    addProvenanceMark: (tabId, mark) =>
      set((state) => ({
        provenanceMarksByTab: {
          ...state.provenanceMarksByTab,
          [tabId]: [...(state.provenanceMarksByTab[tabId] ?? []), mark],
        },
      })),
    getProvenanceMarks: (tabId) => get().provenanceMarksByTab[tabId] ?? [],
    clearProvenanceMarks: (tabId) =>
      set((state) => ({
        provenanceMarksByTab: {
          ...state.provenanceMarksByTab,
          [tabId]: [],
        },
      })),
  }
}
