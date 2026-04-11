import { pushErrorNotice, pushInfoNotice } from './notices'
import {
  checkForDesktopAppUpdate,
  getReleaseDownloadUrl,
  GITHUB_RELEASES_URL,
  isDesktopApp,
  openUpdateUrl,
  shouldAutoCheckUpdates,
  shouldShowUpdateDialog,
  type AvailableRelease,
  type UpdateActionSource,
} from './update'
import { useUpdateStore } from '../store/update'

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toAvailableRelease(result: AvailableRelease | Omit<AvailableRelease, 'hasUpdate'>): AvailableRelease {
  return {
    ...result,
    hasUpdate: true,
  }
}

async function openUpdateUrlWithNotice(url: string): Promise<void> {
  try {
    await openUpdateUrl(url)
  } catch (error) {
    const reason = toErrorMessage(error)
    pushErrorNotice('notices.updateOpenErrorTitle', 'notices.updateOpenErrorMessage', {
      values: { reason },
    })
    throw error
  }
}

async function runUpdateCheck(source: UpdateActionSource): Promise<void> {
  const initialState = useUpdateStore.getState()
  if (initialState.isChecking) return

  if (!isDesktopApp()) {
    if (source === 'manual') {
      await openUpdateUrlWithNotice(GITHUB_RELEASES_URL)
    }
    return
  }

  initialState.startChecking()

  try {
    const result = await checkForDesktopAppUpdate()
    const state = useUpdateStore.getState()

    state.markChecked()

    if (state.skippedVersion && state.skippedVersion !== result.latestVersion) {
      state.clearSkippedVersion()
    }

    if (!result.hasUpdate) {
      state.closeUpdateDialog()

      if (source === 'manual') {
        pushInfoNotice('notices.updateUpToDateTitle', 'notices.updateUpToDateMessage', {
          values: { version: result.currentVersion },
        })
      }

      return
    }

    const latestState = useUpdateStore.getState()
    if (!shouldShowUpdateDialog(source, result.latestVersion, latestState.skippedVersion)) {
      return
    }

    latestState.openUpdateDialog(toAvailableRelease(result))
  } catch (error) {
    const reason = toErrorMessage(error)
    useUpdateStore.getState().failChecking(reason)

    if (source === 'manual') {
      pushErrorNotice('notices.updateCheckErrorTitle', 'notices.updateCheckErrorMessage', {
        values: { reason },
      })
    } else {
      console.error('Automatic update check failed:', error)
    }

    return
  } finally {
    const state = useUpdateStore.getState()
    if (state.isChecking) {
      state.finishChecking()
    }
  }
}

export async function runManualUpdateCheck(): Promise<void> {
  await runUpdateCheck('manual')
}

export async function maybeRunAutomaticUpdateCheck(): Promise<void> {
  const state = useUpdateStore.getState()
  if (!isDesktopApp()) return
  if (!shouldAutoCheckUpdates(state.autoCheckEnabled, state.lastCheckedAt)) return

  await runUpdateCheck('auto')
}

export async function openGitHubReleasesPage(): Promise<void> {
  await openUpdateUrlWithNotice(GITHUB_RELEASES_URL)
}

export async function downloadAvailableRelease(release: Pick<AvailableRelease, 'downloadUrl' | 'releaseUrl'>): Promise<void> {
  await openUpdateUrlWithNotice(getReleaseDownloadUrl(release))
}
