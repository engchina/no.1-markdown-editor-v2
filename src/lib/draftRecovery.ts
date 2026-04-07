export interface RestorableDraftTab {
  id: string
  path: string | null
  content: string
}

export interface DraftRecoveryState<T extends RestorableDraftTab> {
  tabs: T[]
  activeTabId: string | null
}

export function isRestorableDraftTab(tab: Pick<RestorableDraftTab, 'path' | 'content'>): boolean {
  return tab.path === null && tab.content.trim().length > 0
}

export function countRestorableDraftTabs<T extends Pick<RestorableDraftTab, 'path' | 'content'>>(
  tabs: T[]
): number {
  return tabs.filter(isRestorableDraftTab).length
}

export function restoreDraftTabs<T extends RestorableDraftTab>(
  persisted: Partial<DraftRecoveryState<T>> | undefined,
  current: DraftRecoveryState<T>
): DraftRecoveryState<T> {
  const restoredTabs = Array.isArray(persisted?.tabs)
    ? persisted.tabs.filter(isRestorableDraftTab)
    : []
  const tabs = restoredTabs.length > 0 ? restoredTabs : current.tabs
  const requestedActiveId = persisted?.activeTabId
  const activeTabId =
    typeof requestedActiveId === 'string' && tabs.some((tab) => tab.id === requestedActiveId)
      ? requestedActiveId
      : tabs[0]?.id ?? current.activeTabId

  return { tabs, activeTabId }
}
