import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createAIComposerSlice,
  type AIComposerSliceState,
} from './aiComposerSlice.ts'
import {
  createAIHistorySlice,
  mergePersistedAIHistoryState,
  partializeAIHistoryState,
  type AIHistorySliceState,
} from './aiHistorySlice.ts'
import {
  createAIProvenanceSlice,
  type AIProvenanceSliceState,
} from './aiProvenanceSlice.ts'

interface AIStoreState extends AIComposerSliceState, AIHistorySliceState, AIProvenanceSliceState {}

const AI_STORE_STORAGE_KEY = 'ai-session-history'
// Hard cap on the streamed AI draft to keep React renders responsive.
// Roughly ~5MB of UTF-16, comfortably above any realistic single AI response.
const MAX_AI_DRAFT_TEXT_LENGTH = 2_500_000

function createNoopStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    get length() {
      return 0
    },
  }
}

function getAIStoreStorage() {
  if (typeof localStorage !== 'undefined') return localStorage
  return createNoopStorage()
}

export { createInitialAIComposerState } from './aiComposerSlice.ts'

export const useAIStore = create<AIStoreState>()(
  persist(
    (set, get) => ({
      ...createAIComposerSlice<AIStoreState>(set, {
        maxDraftTextLength: MAX_AI_DRAFT_TEXT_LENGTH,
      }),
      ...createAIHistorySlice<AIStoreState>(set, get),
      ...createAIProvenanceSlice<AIStoreState>(set, get),
    }),
    {
      name: AI_STORE_STORAGE_KEY,
      storage: createJSONStorage(getAIStoreStorage),
      partialize: (state) => partializeAIHistoryState(state),
      merge: (persisted, current) =>
        mergePersistedAIHistoryState(persisted as Partial<AIStoreState> | undefined, current),
    }
  )
)
