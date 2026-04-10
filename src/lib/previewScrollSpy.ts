export interface HeadingIntersectionState {
  id: string
  isIntersecting: boolean
}

export function updateVisibleHeadingIds(
  visibleHeadingIds: Set<string>,
  entries: readonly HeadingIntersectionState[]
) {
  for (const entry of entries) {
    if (!entry.id) continue

    if (entry.isIntersecting) {
      visibleHeadingIds.add(entry.id)
      continue
    }

    visibleHeadingIds.delete(entry.id)
  }
}

export function resolveActiveHeadingId(
  orderedHeadingIds: readonly string[],
  visibleHeadingIds: ReadonlySet<string>
) {
  for (const id of orderedHeadingIds) {
    if (visibleHeadingIds.has(id)) return id
  }

  return ''
}
