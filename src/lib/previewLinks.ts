const EXTERNAL_PREVIEW_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export interface PreviewExternalLink {
  href: string
  label: string
}

export function getPreviewExternalLink(
  rawHref: string | null | undefined,
  currentUrl: string
): PreviewExternalLink | null {
  const trimmedHref = rawHref?.trim()
  if (!trimmedHref || trimmedHref.startsWith('#')) {
    return null
  }

  const lowerHref = trimmedHref.toLowerCase()
  const isExplicitExternalHref =
    /^(https?:)?\/\//i.test(trimmedHref) ||
    lowerHref.startsWith('mailto:') ||
    lowerHref.startsWith('tel:')

  if (!isExplicitExternalHref) {
    return null
  }

  let resolvedUrl: URL
  try {
    resolvedUrl = new URL(trimmedHref, currentUrl)
  } catch {
    return null
  }

  if (!EXTERNAL_PREVIEW_PROTOCOLS.has(resolvedUrl.protocol)) {
    return null
  }

  return {
    href: resolvedUrl.toString(),
    label: getPreviewExternalLinkLabel(resolvedUrl),
  }
}

function getPreviewExternalLinkLabel(url: URL): string {
  switch (url.protocol) {
    case 'mailto:':
    case 'tel:':
      return decodeURIComponent(url.pathname || url.href)
    default:
      return url.host || url.href
  }
}
