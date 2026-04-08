const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const localPreviewImageCache = new Map<string, Promise<string>>()

export async function loadLocalPreviewImage(source: string, documentPath: string | null): Promise<string> {
  const trimmedSource = source.trim()
  const trimmedDocumentPath = documentPath?.trim() ?? ''
  if (!trimmedSource) {
    throw new Error('Missing local image source')
  }

  if (!isTauri) {
    return trimmedSource
  }

  const cacheKey = `${trimmedDocumentPath}\n${trimmedSource}`
  const cached = localPreviewImageCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const task = (async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<string>('fetch_local_image_data_url', {
      source: normalizeLocalImageSource(trimmedSource),
      documentPath: trimmedDocumentPath || null,
    })
  })().catch((error) => {
    localPreviewImageCache.delete(cacheKey)
    throw error
  })

  localPreviewImageCache.set(cacheKey, task)
  return task
}

function normalizeLocalImageSource(source: string): string {
  if (!source || /^file:/i.test(source)) {
    return source
  }

  try {
    return decodeURI(source)
  } catch {
    return source
  }
}
