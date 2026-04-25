import type { IconName } from '../components/Icons/AppIcon'

export const SIDEBAR_SURFACE_IDS = [
  'outline',
  'files',
  'search',
  'recent',
] as const

export type SidebarSurfaceId = (typeof SIDEBAR_SURFACE_IDS)[number]
export type SidebarSurfaceCommandId = `view.sidebar.${SidebarSurfaceId}`

export interface SidebarSurfaceMeta {
  id: SidebarSurfaceId
  icon: IconName
  titleKey: string
  surfaceClassName?: string
}

const SIDEBAR_SURFACE_META_BY_ID: Record<
  SidebarSurfaceId,
  Omit<SidebarSurfaceMeta, 'id'>
> = {
  outline: { icon: 'outline', titleKey: 'sidebar.outline' },
  files: { icon: 'folder', titleKey: 'sidebar.files', surfaceClassName: 'p-2' },
  search: { icon: 'search', titleKey: 'sidebar.search' },
  recent: { icon: 'clock', titleKey: 'menu.recentFiles' },
}

const SIDEBAR_SURFACE_ID_SET = new Set<string>(SIDEBAR_SURFACE_IDS)
const SIDEBAR_COMMAND_ID_PREFIX = 'view.sidebar.'
const SIDEBAR_COMMAND_PRIORITY_BASE = 216

export const SIDEBAR_SURFACE_META: SidebarSurfaceMeta[] = SIDEBAR_SURFACE_IDS.map((id) => ({
  id,
  ...SIDEBAR_SURFACE_META_BY_ID[id],
}))

export function isSidebarSurfaceId(value: unknown): value is SidebarSurfaceId {
  return typeof value === 'string' && SIDEBAR_SURFACE_ID_SET.has(value)
}

export function getSidebarSurfaceMeta(id: SidebarSurfaceId): SidebarSurfaceMeta {
  return {
    id,
    ...SIDEBAR_SURFACE_META_BY_ID[id],
  }
}

export function getSidebarSurfaceCommandId(id: SidebarSurfaceId): SidebarSurfaceCommandId {
  return `${SIDEBAR_COMMAND_ID_PREFIX}${id}` as SidebarSurfaceCommandId
}

export function getSidebarSurfaceIdFromCommandId(commandId: string): SidebarSurfaceId | null {
  if (!commandId.startsWith(SIDEBAR_COMMAND_ID_PREFIX)) return null

  const id = commandId.slice(SIDEBAR_COMMAND_ID_PREFIX.length)
  return isSidebarSurfaceId(id) ? id : null
}

export function getSidebarSurfaceCommandPriority(commandId: string): number | null {
  const surfaceId = getSidebarSurfaceIdFromCommandId(commandId)
  if (!surfaceId) return null

  const index = SIDEBAR_SURFACE_IDS.indexOf(surfaceId)
  return index === -1 ? null : SIDEBAR_COMMAND_PRIORITY_BASE + index
}
