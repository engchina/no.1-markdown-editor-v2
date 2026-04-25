import type { ComponentType } from 'react'
import {
  SIDEBAR_SURFACE_META,
  type SidebarSurfaceId,
  type SidebarSurfaceMeta,
} from '../../lib/sidebarSurfaces'
import FileTree from './FileTree'
import OutlinePanel from './OutlinePanel'
import RecentPanel from './RecentPanel'
import SearchPanel from './SearchPanel'

export interface SidebarSurfaceDefinition extends SidebarSurfaceMeta {
  component: ComponentType
}

const SIDEBAR_SURFACE_COMPONENTS: Record<SidebarSurfaceId, ComponentType> = {
  outline: OutlinePanel,
  files: FileTree,
  search: SearchPanel,
  recent: RecentPanel,
}

export const SIDEBAR_SURFACES: SidebarSurfaceDefinition[] = SIDEBAR_SURFACE_META.map((surface) => ({
  ...surface,
  component: SIDEBAR_SURFACE_COMPONENTS[surface.id],
}))
