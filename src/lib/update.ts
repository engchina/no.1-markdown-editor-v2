export const GITHUB_RELEASES_URL = 'https://github.com/engchina/no.1-markdown-editor/releases'
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

type AppVersionGlobal = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>
  }
}

export type UpdateActionSource = 'manual' | 'auto'

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseUrl: string
  downloadUrl: string | null
  assetName: string | null
  releaseNotes: string
  publishedAt: string | null
}

export interface AvailableRelease extends UpdateCheckResult {
  hasUpdate: true
}

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function getBundledAppVersion(): string {
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0) {
    return __APP_VERSION__
  }

  const npmPackageVersion = (globalThis as AppVersionGlobal).process?.env?.npm_package_version
  if (typeof npmPackageVersion === 'string' && npmPackageVersion.trim().length > 0) {
    return npmPackageVersion
  }

  return '0.0.0'
}

export async function getCurrentAppVersion(): Promise<string> {
  if (!isDesktopApp()) return getBundledAppVersion()

  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    return await getVersion()
  } catch {
    return getBundledAppVersion()
  }
}

export async function checkForDesktopAppUpdate(): Promise<UpdateCheckResult> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<UpdateCheckResult>('check_for_app_update')
}

export function shouldAutoCheckUpdates(
  autoCheckEnabled: boolean,
  lastCheckedAt: number | null,
  now = Date.now()
): boolean {
  if (!autoCheckEnabled) return false
  if (lastCheckedAt === null) return true
  return now - lastCheckedAt >= UPDATE_CHECK_INTERVAL_MS
}

export function shouldShowUpdateDialog(
  source: UpdateActionSource,
  latestVersion: string,
  skippedVersion: string | null
): boolean {
  return source === 'manual' || skippedVersion !== latestVersion
}

export function getReleaseDownloadUrl(
  release: Pick<UpdateCheckResult, 'downloadUrl' | 'releaseUrl'>
): string {
  return release.downloadUrl ?? release.releaseUrl
}

export function normalizeReleaseNotes(notes: string): string {
  const trimmed = notes.replace(/\r\n?/g, '\n').trim()
  if (!trimmed) return ''

  return trimmed
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function formatPublishedAt(publishedAt: string | null, locale: string): string | null {
  if (!publishedAt) return null

  const date = new Date(publishedAt)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

export async function openUpdateUrl(url: string): Promise<void> {
  if (isDesktopApp()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
