import { create } from 'zustand'

export type NoticeKind = 'info' | 'success' | 'error'

export interface Notice {
  id: string
  kind: NoticeKind
  title: string
  message?: string
  timeoutMs: number
  expiresAt: number
}

interface NotificationsState {
  notices: Notice[]
  pushNotice: (notice: Omit<Notice, 'id' | 'timeoutMs' | 'expiresAt'> & { id?: string; timeoutMs?: number }) => string
  dismissNotice: (id: string) => void
  clearNotices: () => void
}

const DEFAULT_TIMEOUT_MS: Record<NoticeKind, number> = {
  info: 3600,
  success: 2600,
  error: 5200,
}

function createNoticeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notices: [],
  pushNotice: ({ id, kind, title, message, timeoutMs }) => {
    const nextId = id ?? createNoticeId()
    const nextTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS[kind]
    set((state) => ({
      notices: [
        ...state.notices.slice(-3),
        {
          id: nextId,
          kind,
          title,
          message,
          timeoutMs: nextTimeoutMs,
          expiresAt: Date.now() + nextTimeoutMs,
        },
      ],
    }))
    return nextId
  },
  dismissNotice: (id) => {
    set((state) => ({
      notices: state.notices.filter((notice) => notice.id !== id),
    }))
  },
  clearNotices: () => set({ notices: [] }),
}))
