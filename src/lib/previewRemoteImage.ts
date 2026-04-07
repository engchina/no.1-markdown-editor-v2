const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const previewImageCache = new Map<string, Promise<string>>()

export async function loadExternalPreviewImage(source: string): Promise<string> {
  const trimmedSource = source.trim()
  if (!trimmedSource) {
    throw new Error('Missing external image source')
  }

  if (!isTauri) {
    return trimmedSource
  }

  const cached = previewImageCache.get(trimmedSource)
  if (cached) {
    return cached
  }

  const task = (async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<string>('fetch_remote_image_data_url', { url: trimmedSource })
  })().catch((error) => {
    previewImageCache.delete(trimmedSource)
    throw error
  })

  previewImageCache.set(trimmedSource, task)
  return task
}
