import { slugifyHeading } from './headingIds.ts'

const PREVIEW_NAVIGATION_TOP_OFFSET_PX = 16
const PREVIEW_TARGET_FLASH_DURATION_MS = 1200

export interface PreviewNavigationScrollTopInput {
  previewTop: number
  previewHeight: number
  previewScrollHeight: number
  previewScrollTop: number
  targetTop: number
  topOffset?: number
}

export function getPreviewInternalAnchorId(
  rawHref: string | null | undefined,
  currentUrl: string
): string | null {
  const trimmedHref = rawHref?.trim()
  if (!trimmedHref) return null

  let resolvedUrl: URL
  let currentLocation: URL

  try {
    resolvedUrl = new URL(trimmedHref, currentUrl)
    currentLocation = new URL(currentUrl)
  } catch {
    return null
  }

  if (resolvedUrl.hash.length <= 1) return null
  if (resolvedUrl.origin !== currentLocation.origin) return null
  if (normalizePreviewPathname(resolvedUrl.pathname) !== normalizePreviewPathname(currentLocation.pathname)) {
    return null
  }
  if (resolvedUrl.search !== currentLocation.search) return null

  const anchorId = resolvedUrl.hash.slice(1).trim()
  if (!anchorId) return null

  try {
    return decodeURIComponent(anchorId)
  } catch {
    return anchorId
  }
}

export function resolvePreviewNavigationScrollTop({
  previewTop,
  previewHeight,
  previewScrollHeight,
  previewScrollTop,
  targetTop,
  topOffset = PREVIEW_NAVIGATION_TOP_OFFSET_PX,
}: PreviewNavigationScrollTopInput) {
  const maxScrollTop = Math.max(0, previewScrollHeight - previewHeight)
  const nextScrollTop = previewScrollTop + (targetTop - previewTop) - topOffset
  return clamp(nextScrollTop, 0, maxScrollTop)
}

export function resolvePreviewAnchorTarget(preview: HTMLElement, rawTargetId: string): HTMLElement | null {
  const targetId = rawTargetId.trim().replace(/^#/u, '')
  if (!targetId) return null

  const ownerDocument = preview.ownerDocument
  const candidateIds = [targetId]
  const slugCandidate = slugifyHeading(targetId)
  if (slugCandidate && !candidateIds.includes(slugCandidate)) {
    candidateIds.push(slugCandidate)
  }

  for (const candidateId of candidateIds) {
    const element = ownerDocument.getElementById(candidateId)
    if (element instanceof HTMLElement && preview.contains(element)) {
      return element
    }
  }

  for (const candidateId of candidateIds) {
    const namedElements = ownerDocument.getElementsByName(candidateId)
    for (const element of namedElements) {
      if (element instanceof HTMLElement && preview.contains(element)) {
        return element
      }
    }
  }

  return null
}

export function scrollPreviewToTarget(preview: HTMLElement, target: HTMLElement) {
  const top = resolvePreviewNavigationScrollTop({
    previewTop: preview.getBoundingClientRect().top,
    previewHeight: preview.clientHeight,
    previewScrollHeight: preview.scrollHeight,
    previewScrollTop: preview.scrollTop,
    targetTop: target.getBoundingClientRect().top,
  })

  if (typeof preview.scrollTo === 'function') {
    preview.scrollTo({
      top,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
    return
  }

  preview.scrollTop = top
}

export function flashPreviewTarget(target: HTMLElement) {
  if (typeof target.animate !== 'function') return

  target.animate(
    [
      { background: 'color-mix(in srgb, var(--accent) 20%, transparent)' },
      { background: 'transparent' },
    ],
    { duration: PREVIEW_TARGET_FLASH_DURATION_MS }
  )
}

function normalizePreviewPathname(pathname: string) {
  if (!pathname) return '/'

  const withoutIndex =
    pathname === '/index.html'
      ? '/'
      : pathname.endsWith('/index.html')
        ? pathname.slice(0, -'/index.html'.length) || '/'
        : pathname

  if (withoutIndex.length > 1 && withoutIndex.endsWith('/')) {
    return withoutIndex.slice(0, -1)
  }

  return withoutIndex || '/'
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
