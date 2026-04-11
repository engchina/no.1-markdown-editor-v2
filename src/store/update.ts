import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AvailableRelease } from '../lib/update'

interface UpdateStoreState {
  autoCheckEnabled: boolean
  lastCheckedAt: number | null
  skippedVersion: string | null
  isChecking: boolean
  dialogOpen: boolean
  availableRelease: AvailableRelease | null
  lastError: string | null
  setAutoCheckEnabled: (enabled: boolean) => void
  startChecking: () => void
  finishChecking: () => void
  markChecked: (checkedAt?: number) => void
  failChecking: (message: string) => void
  clearLastError: () => void
  openUpdateDialog: (release: AvailableRelease) => void
  closeUpdateDialog: () => void
  skipVersion: (version: string) => void
  clearSkippedVersion: () => void
}

const UPDATE_STORE_STORAGE_KEY = 'app-update-settings'

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

function getUpdateStoreStorage(): Storage {
  if (typeof localStorage !== 'undefined') return localStorage
  return createNoopStorage()
}

export const useUpdateStore = create<UpdateStoreState>()(
  persist(
    (set) => ({
      autoCheckEnabled: true,
      lastCheckedAt: null,
      skippedVersion: null,
      isChecking: false,
      dialogOpen: false,
      availableRelease: null,
      lastError: null,
      setAutoCheckEnabled: (autoCheckEnabled) => set({ autoCheckEnabled }),
      startChecking: () => set({ isChecking: true, lastError: null }),
      finishChecking: () => set({ isChecking: false }),
      markChecked: (lastCheckedAt = Date.now()) => set({ lastCheckedAt }),
      failChecking: (lastError) => set({ isChecking: false, lastError }),
      clearLastError: () => set({ lastError: null }),
      openUpdateDialog: (availableRelease) =>
        set({
          availableRelease,
          dialogOpen: true,
          lastError: null,
        }),
      closeUpdateDialog: () =>
        set({
          dialogOpen: false,
          availableRelease: null,
        }),
      skipVersion: (skippedVersion) =>
        set({
          skippedVersion,
          dialogOpen: false,
          availableRelease: null,
        }),
      clearSkippedVersion: () => set({ skippedVersion: null }),
    }),
    {
      name: UPDATE_STORE_STORAGE_KEY,
      storage: createJSONStorage(getUpdateStoreStorage),
      partialize: (state) => ({
        autoCheckEnabled: state.autoCheckEnabled,
        lastCheckedAt: state.lastCheckedAt,
        skippedVersion: state.skippedVersion,
      }),
    }
  )
)
