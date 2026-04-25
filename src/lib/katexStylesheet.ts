const katexStylesheetUrl = new URL('../../node_modules/katex/dist/katex.min.css', import.meta.url).href

let pendingStylesheetLoad: Promise<void> | null = null

export { katexStylesheetUrl }

export function ensureKatexStylesheet(): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.resolve()
  }

  const existing = document.head.querySelector<HTMLLinkElement>('link[data-katex-stylesheet="true"]')
  if (existing) {
    return Promise.resolve()
  }

  if (pendingStylesheetLoad) {
    return pendingStylesheetLoad
  }

  pendingStylesheetLoad = new Promise((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = katexStylesheetUrl
    link.dataset.katexStylesheet = 'true'
    link.onload = () => resolve()
    link.onerror = () => {
      pendingStylesheetLoad = null
      reject(new Error('Failed to load KaTeX stylesheet'))
    }

    document.head.appendChild(link)
  })

  return pendingStylesheetLoad
}
